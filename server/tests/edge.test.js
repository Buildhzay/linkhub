import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDatabase, seedDatabase } from '../src/db.js';

const serverDirectory = resolve(import.meta.dirname, '..');
const jwtSecret = 'test-secret-with-more-than-24-characters';
let child;
let temporaryDirectory;
let baseUrl;
let adminToken;
let managerToken;
let staffToken;

async function unusedPort() {
  const listener = createTcpServer();
  await new Promise((resolveListen, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolveListen);
  });
  const address = listener.address();
  await new Promise((resolveClose, reject) => listener.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function request(path, options = {}) {
  const { token, method = 'GET', body, rawBody, headers: extraHeaders = {} } = options;
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const requestBody = rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body);
  if (requestBody !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: requestBody
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : Buffer.from(await response.arrayBuffer());
  return { response, data };
}

function signedToken(payload, header = { alg: 'HS256', typ: 'JWT' }, secret = jwtSecret) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function readZipEntry(archive, wantedName) {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = archive.lastIndexOf(endSignature);
  assert.notEqual(endOffset, -1, 'XLSX must contain a ZIP end record');
  const count = archive.readUInt16LE(endOffset + 10);
  let offset = archive.readUInt32LE(endOffset + 16);
  for (let index = 0; index < count; index++) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const filenameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const filename = archive.subarray(offset + 46, offset + 46 + filenameLength).toString();
    if (filename === wantedName) {
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      return inflateRawSync(archive.subarray(dataOffset, dataOffset + compressedSize)).toString('utf8');
    }
    offset += 46 + filenameLength + extraLength + commentLength;
  }
  throw new Error(`Missing XLSX entry: ${wantedName}`);
}

async function login(username, password) {
  const { response, data } = await request('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  });
  assert.equal(response.status, 200);
  return data.token;
}

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'linkhub-edge-'));
  const port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
      DATABASE_PATH: join(temporaryDirectory, 'edge.sqlite'),
      JWT_SECRET: jwtSecret
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let startupOutput = '';
  child.stdout.on('data', (chunk) => { startupOutput += chunk.toString(); });
  child.stderr.on('data', (chunk) => { startupOutput += chunk.toString(); });
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error(`API process exited during startup: ${startupOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  assert.equal(ready, true, `API did not start: ${startupOutput}`);
  adminToken = await login('admin', 'Admin@123');
  managerToken = await login('manager', 'Manager@123');
  staffToken = await login('staff', 'Staff@123');
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise((resolveExit) => child.once('exit', resolveExit));
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

test('rejects forged, expired, wrong-algorithm, and disabled-user tokens', async () => {
  const [header, , signature] = staffToken.split('.');
  const forgedPayload = Buffer.from(JSON.stringify({ sub: 3, role: 'admin', exp: 9999999999 })).toString('base64url');
  const forged = `${header}.${forgedPayload}.${signature}`;
  assert.equal((await request('/api/users', { token: forged })).response.status, 401);

  const adminClaimsForStaff = signedToken({ sub: 3, role: 'admin', exp: 9999999999 });
  assert.equal((await request('/api/users', { token: adminClaimsForStaff })).response.status, 403);

  const invalidAlgorithm = signedToken(
    { sub: 1, role: 'admin', exp: 9999999999 },
    { alg: 'none', typ: 'JWT' }
  );
  assert.equal((await request('/api/users', { token: invalidAlgorithm })).response.status, 401);
  assert.equal((await request('/api/users', {
    token: signedToken({ sub: 1, role: 'admin', exp: 9999999999 }, undefined, 'wrong-signing-key')
  })).response.status, 401);
  assert.equal((await request('/api/users', {
    token: signedToken({ sub: 1, role: 'admin', exp: Math.floor(Date.now() / 1000) - 1 })
  })).response.status, 401);

  const disabled = await request('/api/users/3', {
    token: adminToken,
    method: 'PATCH',
    body: { is_active: false }
  });
  assert.equal(disabled.response.status, 200);
  assert.equal((await request('/api/auth/me', { token: staffToken })).response.status, 401);
  const reenabled = await request('/api/users/3', {
    token: adminToken,
    method: 'PATCH',
    body: { is_active: true }
  });
  assert.equal(reenabled.response.status, 200);
});

test('handles malformed paths and JSON, and returns 413 for oversized bodies', async () => {
  assert.equal((await request('/api/projects/%E0%A4%A', { token: managerToken })).response.status, 400);
  assert.equal((await request('/api/projects', { token: managerToken, method: 'POST', rawBody: '{"name":' })).response.status, 400);
  assert.equal((await request('/api/projects', { token: managerToken, method: 'POST', rawBody: '[]' })).response.status, 400);

  const oversized = JSON.stringify({
    name: 'Oversized request',
    website_url: 'https://oversized.example',
    description: 'x'.repeat(1.2 * 1024 * 1024)
  });
  assert.equal((await request('/api/projects', {
    token: managerToken,
    method: 'POST',
    rawBody: oversized
  })).response.status, 413);
  assert.equal((await request('/api/health')).response.status, 200);
});

test('allows both Vite hostnames and rejects unexpected browser origins', async () => {
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const result = await request('/api/health', { headers: { Origin: origin } });
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get('access-control-allow-origin'), origin);
  }

  const denied = await request('/api/health', { headers: { Origin: 'https://untrusted.example' } });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.response.headers.get('access-control-allow-origin'), null);
});

test('returns auth and validation errors without dropping the API process', async () => {
  const unauthenticated = await request('/api/dashboard');
  assert.equal(unauthenticated.response.status, 401);
  assert.match(unauthenticated.data.error, /đăng nhập lại/);

  const invalid = await request('/api/projects', {
    token: managerToken,
    method: 'POST',
    body: { website_url: 'https://missing-name.example' }
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.error, /Tên là bắt buộc/);
  assert.equal((await request('/api/health')).response.status, 200);
});

test('keeps SQL-like search and sort values as data', async () => {
  const payload = "' OR 1=1 --";
  const search = await request(`/api/projects?q=${encodeURIComponent(payload)}`, { token: managerToken });
  assert.equal(search.response.status, 200);
  assert.equal(search.data.pagination.total, 0);

  const sort = await request(`/api/projects?sort=${encodeURIComponent('name; DROP TABLE users')}`, { token: managerToken });
  assert.equal(sort.response.status, 400);
  assert.equal((await request('/api/users', { token: adminToken })).response.status, 200);

  const storedName = "x'); DROP TABLE users;--";
  const created = await request('/api/projects', {
    token: managerToken,
    method: 'POST',
    body: { name: storedName, website_url: 'https://injection-test.example' }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.name, storedName);
  assert.equal((await request(`/api/projects/${created.data.id}`, { token: managerToken })).data.name, storedName);
  assert.equal((await request(`/api/projects/${created.data.id}`, { token: managerToken, method: 'DELETE' })).response.status, 200);
});

test('validates completed profiles and distinct source and target URLs', async () => {
  const missingProfileUrl = await request('/api/profiles', {
    token: managerToken,
    method: 'POST',
    body: { project_id: 1, platform_id: 12, name: 'Hồ sơ chưa có URL', status: 'completed' }
  });
  assert.equal(missingProfileUrl.response.status, 400);
  assert.match(missingProfileUrl.data.error, /phải có URL hồ sơ/);

  const profile = await request('/api/profiles', {
    token: managerToken,
    method: 'POST',
    body: { project_id: 1, platform_id: 12, name: 'Hồ sơ kiểm tra', status: 'in_progress' }
  });
  assert.equal(profile.response.status, 201);
  const updateWithoutUrl = await request(`/api/profiles/${profile.data.id}`, {
    token: managerToken,
    method: 'PATCH',
    body: { status: 'completed' }
  });
  assert.equal(updateWithoutUrl.response.status, 400);

  const sameUrl = await request('/api/links', {
    token: managerToken,
    method: 'POST',
    body: {
      project_id: 1,
      platform_id: 12,
      source_url: 'https://same.example/path#source',
      target_url: 'https://SAME.example:443/path#target'
    }
  });
  assert.equal(sameUrl.response.status, 400);
  assert.match(sameUrl.data.error, /URL nguồn và URL đích phải khác nhau/);

  const link = await request('/api/links', {
    token: managerToken,
    method: 'POST',
    body: {
      project_id: 1,
      platform_id: 12,
      source_url: 'https://source.example/path',
      target_url: 'https://target.example/path'
    }
  });
  assert.equal(link.response.status, 201);
  const updateSameUrl = await request(`/api/links/${link.data.id}`, {
    token: managerToken,
    method: 'PATCH',
    body: { target_url: link.data.source_url }
  });
  assert.equal(updateSameUrl.response.status, 400);
});

test('localizes validation errors returned to the frontend', async () => {
  const invalid = await request('/api/projects', {
    token: managerToken,
    method: 'POST',
    body: { website_url: 'https://missing-name.example' }
  });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.error, /Tên là bắt buộc/);
  assert.doesNotMatch(invalid.data.error, /name is required/i);
});

test('rejects invalid URL schemes and impossible dates', async () => {
  for (const websiteUrl of ['javascript:alert(1)', 'ftp://invalid.example', 'not-a-url']) {
    const invalid = await request('/api/projects', {
      token: managerToken,
      method: 'POST',
      body: { name: `Invalid ${websiteUrl}`, website_url: websiteUrl }
    });
    assert.equal(invalid.response.status, 400, websiteUrl);
  }

  for (const dueDate of ['2026-02-30', '2026-13-01', '2026-1-1']) {
    const invalid = await request('/api/tasks', {
      token: managerToken,
      method: 'POST',
      body: { project_id: 1, assignee_id: 3, title: 'Invalid due date', category: 'research', due_date: dueDate }
    });
    assert.equal(invalid.response.status, 400, dueDate);
  }
});

test('preserves special characters in XLSX and safely escapes them in PDF', async () => {
  const platformName = "T&<\" ' (ok) \\ Café";
  const platform = await request('/api/platforms', {
    token: managerToken,
    method: 'POST',
    body: {
      name: platformName,
      url: 'https://special-platform.example',
      category: 'Testing'
    }
  });
  assert.equal(platform.response.status, 201);

  const xlsxResponse = await request('/api/reports/export', {
    token: managerToken,
    method: 'POST',
    body: { report_type: 'platform', platform_id: platform.data.id, format: 'xlsx' }
  });
  assert.equal(xlsxResponse.response.status, 200);
  assert.equal(xlsxResponse.data.subarray(0, 2).toString(), 'PK');
  const worksheet = readZipEntry(xlsxResponse.data, 'xl/worksheets/sheet2.xml');
  assert.ok(worksheet.includes('T&amp;&lt;&quot; &apos; (ok) \\ Café'));

  const summary = readZipEntry(xlsxResponse.data, 'xl/worksheets/sheet1.xml');
  assert.match(summary, /Tỷ lệ hoàn thành dự án/);
  assert.match(summary, /Tỷ lệ hoàn thành công việc/);
  assert.match(summary, /<c r="B2"><v>\d+<\/v><\/c>/);
  const overviewXlsx = await request('/api/reports/export', {
    token: managerToken,
    method: 'POST',
    body: { report_type: 'overview', format: 'xlsx' }
  });
  assert.equal(overviewXlsx.response.status, 200);
  const overviewSummary = readZipEntry(overviewXlsx.data, 'xl/worksheets/sheet1.xml');
  const dashboard = await request('/api/dashboard', { token: managerToken });
  const expectedTaskCompletion = Math.round(
    dashboard.data.totals.completed_tasks / dashboard.data.totals.tasks * 100
  );
  assert.ok(overviewSummary.includes(`<c r="B12"><v>${expectedTaskCompletion}</v></c>`));

  const periodXlsx = await request('/api/reports/export', {
    token: managerToken,
    method: 'POST',
    body: {
      report_type: 'period',
      start_date: '2000-01-01',
      end_date: '2099-12-31',
      format: 'xlsx'
    }
  });
  assert.equal(periodXlsx.response.status, 200);
  const workbook = readZipEntry(periodXlsx.data, 'xl/workbook.xml');
  assert.equal((workbook.match(/<sheet /g) || []).length, 5);
  const weeklySheet = readZipEntry(periodXlsx.data, 'xl/worksheets/sheet5.xml');
  assert.match(weeklySheet, /Tuần bắt đầu/);
  assert.ok((weeklySheet.match(/<row /g) || []).length >= 4, 'weekly report should contain activity from multiple weeks');

  const emptyPeriodXlsx = await request('/api/reports/export', {
    token: managerToken,
    method: 'POST',
    body: {
      report_type: 'period',
      start_date: '1990-01-01',
      end_date: '1990-01-07',
      format: 'xlsx'
    }
  });
  assert.equal(emptyPeriodXlsx.response.status, 200);
  const emptyPeriodWorkbook = readZipEntry(emptyPeriodXlsx.data, 'xl/workbook.xml');
  assert.equal((emptyPeriodWorkbook.match(/<sheet /g) || []).length, 5);
  const emptyWeeklySheet = readZipEntry(emptyPeriodXlsx.data, 'xl/worksheets/sheet5.xml');
  assert.equal((emptyWeeklySheet.match(/<row /g) || []).length, 1, 'empty date ranges still include the weekly-trend sheet');

  const pdfResponse = await request('/api/reports/export', {
    token: managerToken,
    method: 'POST',
    body: { report_type: 'platform', platform_id: platform.data.id, format: 'pdf' }
  });
  assert.equal(pdfResponse.response.status, 200);
  const pdf = pdfResponse.data.toString('latin1');
  assert.ok(pdf.startsWith('%PDF-'));
  assert.match(pdf, /\\\(ok\\\)/);
  assert.ok(pdf.includes('Nen tang da trien khai'));
  assert.ok(!pdf.includes('?a trien khai'));
  assert.ok(pdf.includes('Ty le hoan thanh cong viec'));
});

test('concurrent inserts and Kanban moves retain unique records and positions', async () => {
  const links = await Promise.all(Array.from({ length: 40 }, (_, index) => request('/api/links', {
    token: managerToken,
    method: 'POST',
    body: {
      project_id: 1,
      platform_id: 1,
      source_url: `https://parallel-source.example/${index}`,
      target_url: 'https://northstar.example'
    }
  })));
  assert.ok(links.every((item) => item.response.status === 201));
  assert.equal(new Set(links.map((item) => item.data.id)).size, links.length);

  const tasks = [];
  for (let index = 0; index < 8; index++) {
    const created = await request('/api/tasks', {
      token: managerToken,
      method: 'POST',
      body: {
        project_id: 1,
        assignee_id: 3,
        title: `Concurrent task ${index}`,
        category: 'research',
        status: 'todo'
      }
    });
    assert.equal(created.response.status, 201);
    tasks.push(created.data);
  }

  const moves = await Promise.all(tasks.map((task) => request(`/api/tasks/${task.id}`, {
    token: managerToken,
    method: 'PATCH',
    body: { status: 'review', position: 0 }
  })));
  assert.ok(moves.every((item) => item.response.status === 200));

  const review = await request('/api/tasks?project_id=1&status=review&limit=100', { token: managerToken });
  const positions = review.data.data.map((task) => task.position).sort((a, b) => a - b);
  assert.equal(new Set(positions).size, positions.length);
  assert.deepEqual(positions, positions.map((_, index) => index));
});

test('records successful actions with actor data, but not rejected actions', async () => {
  const project = await request('/api/projects', {
    token: managerToken,
    method: 'POST',
    body: { name: 'Activity test project', website_url: 'https://activity-test.example' }
  });
  assert.equal(project.response.status, 201);

  const beforeDeniedAction = await request('/api/activity-logs?limit=100', { token: managerToken });
  const totalBeforeDeniedAction = beforeDeniedAction.data.pagination.total;
  const denied = await request(`/api/projects/${project.data.id}`, {
    token: staffToken,
    method: 'DELETE'
  });
  assert.equal(denied.response.status, 403);

  const logs = await request('/api/activity-logs?limit=100', { token: managerToken });
  assert.equal(logs.data.pagination.total, totalBeforeDeniedAction);
  const createLog = logs.data.data.find((entry) =>
    entry.entity_type === 'project' && entry.entity_id === project.data.id && entry.action === 'create'
  );
  assert.ok(createLog);
  assert.equal(createLog.user_id, 2);
  assert.ok(createLog.created_at);
  assert.equal((await request(`/api/projects/${project.data.id}`, {
    token: managerToken,
    method: 'DELETE'
  })).response.status, 200);
});

test('seed is idempotent and keeps database constraints valid', () => {
  const seedPath = join(temporaryDirectory, 'seed.sqlite');
  const database = openDatabase(seedPath);
  try {
    seedDatabase(database);
    const count = (table) => database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    const firstCounts = ['users', 'projects', 'platforms', 'profiles', 'links', 'tasks', 'contents']
      .map(count);
    seedDatabase(database);
    const secondCounts = ['users', 'projects', 'platforms', 'profiles', 'links', 'tasks', 'contents']
      .map(count);
    assert.deepEqual(secondCounts, firstCounts);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    assert.equal(database.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM links l
      JOIN profiles p ON p.id = l.profile_id
      WHERE p.status != 'completed' OR p.verification_status != 'verified'`).get().count, 0);
    assert.ok(database.prepare(`SELECT COUNT(DISTINCT substr(completed_at, 1, 10)) AS count
      FROM tasks WHERE status = 'completed'`).get().count >= 4);
    assert.ok(database.prepare(`SELECT COUNT(DISTINCT date(created_at, '-' ||
      ((CAST(strftime('%w', created_at) AS INTEGER) + 6) % 7) || ' days')) AS count
      FROM profiles WHERE status = 'completed' AND verification_status = 'verified'`).get().count >= 4);
    assert.ok(database.prepare(`SELECT COUNT(DISTINCT date(recorded_at, '-' ||
      ((CAST(strftime('%w', recorded_at) AS INTEGER) + 6) % 7) || ' days')) AS count
      FROM links`).get().count >= 4);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM profiles WHERE status = 'not_started' AND profile_url != ''").get().count, 0);
    assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM links l
      JOIN profiles p ON p.id = l.profile_id
      WHERE julianday(l.recorded_at) < julianday(p.created_at)
      OR julianday(l.recorded_at) > julianday('now')`).get().count, 0);
    const sourceLinks = database.prepare('SELECT source_url FROM links').all();
    assert.equal(new Set(sourceLinks.map((link) => new URL(link.source_url).host)).size, 4);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM links WHERE status = 'active'").get().count, 14);
    assert.ok(database.prepare("SELECT COUNT(*) AS count FROM projects WHERE name LIKE '%Hưng Phát'").get().count === 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM tasks WHERE title LIKE 'Demo task %'").get().count, 0);
  } finally {
    database.close();
  }
});
