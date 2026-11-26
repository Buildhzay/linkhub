import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const serverDirectory = resolve(import.meta.dirname, '..');
let child;
let port;
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

async function request(path, { token, method = 'GET', body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, data };
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
  const { response, data } = await request('/api/auth/login', { method: 'POST', body: { username, password } });
  assert.equal(response.status, 200);
  return data.token;
}

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'linkhub-api-'));
  port = await unusedPort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
      DATABASE_PATH: join(temporaryDirectory, 'test.sqlite'),
      JWT_SECRET: 'test-secret-with-more-than-24-characters'
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
    } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
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

test('seed data, authentication and dashboard are database-backed', async () => {
  const { response, data } = await request('/api/dashboard', { token: adminToken });
  assert.equal(response.status, 200);
  assert.equal(data.totals.projects, 3);
  assert.equal(data.totals.platforms, 12);
  assert.equal(data.totals.profiles, 18);
  assert.equal(data.totals.links, 24);
  assert.equal(data.totals.tasks, 18);
  const linkStats = await request('/api/links/stats', { token: adminToken });
  assert.equal(linkStats.response.status, 200);
  assert.ok(linkStats.data.by_status.length >= 5);

  const denied = await request('/api/dashboard');
  assert.equal(denied.response.status, 401);
  const badLogin = await request('/api/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong-password' } });
  assert.equal(badLogin.response.status, 401);
  for (let attempt = 0; attempt < 8; attempt++) {
    const failed = await request('/api/auth/login', {
      method: 'POST', body: { username: 'rate-limit-user', password: 'incorrect' }
    });
    assert.equal(failed.response.status, 401);
  }
  const limited = await request('/api/auth/login', {
    method: 'POST', body: { username: 'rate-limit-user', password: 'incorrect' }
  });
  assert.equal(limited.response.status, 429);

  const staffLogs = await request('/api/activity-logs', { token: staffToken });
  assert.equal(staffLogs.response.status, 200);
  assert.ok(staffLogs.data.data.every((entry) => entry.user_id === 3));
});

test('role authorization and project CRUD work', async () => {
  const forbidden = await request('/api/platforms', {
    token: staffToken, method: 'POST',
    body: { name: 'Unauthorized', url: 'https://unauthorized.example', category: 'Demo' }
  });
  assert.equal(forbidden.response.status, 403);

  const created = await request('/api/projects', {
    token: managerToken, method: 'POST',
    body: { name: 'API test project', website_url: 'https://api-test.example', status: 'active' }
  });
  assert.equal(created.response.status, 201);
  const id = created.data.id;
  assert.ok(id);

  const updated = await request(`/api/projects/${id}`, {
    token: managerToken, method: 'PATCH', body: { industry: 'Testing' }
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.industry, 'Testing');

  const removed = await request(`/api/projects/${id}`, { token: managerToken, method: 'DELETE' });
  assert.equal(removed.response.status, 200);
  const missing = await request(`/api/projects/${id}`, { token: managerToken });
  assert.equal(missing.response.status, 404);
});

test('platforms, task workflow and content CRUD work', async () => {
  const platform = await request('/api/platforms', {
    token: managerToken, method: 'POST',
    body: { name: 'API test platform', url: 'https://api-platform.example', category: 'Testing' }
  });
  assert.equal(platform.response.status, 201);
  const platformId = platform.data.id;
  const platformUpdate = await request(`/api/platforms/${platformId}`, {
    token: managerToken, method: 'PATCH', body: { priority: 'high' }
  });
  assert.equal(platformUpdate.data.priority, 'high');

  const task = await request('/api/tasks', {
    token: managerToken, method: 'POST',
    body: { project_id: 1, assignee_id: 3, title: 'API test task', category: 'research', status: 'todo' }
  });
  assert.equal(task.response.status, 201);
  const taskUpdate = await request(`/api/tasks/${task.data.id}`, {
    token: staffToken, method: 'PATCH', body: { status: 'completed', position: 0 }
  });
  assert.equal(taskUpdate.response.status, 200);
  assert.equal(taskUpdate.data.position, 0);
  assert.ok(taskUpdate.data.completed_at);
  const kanban = await request('/api/tasks?project_id=1&status=completed', { token: managerToken });
  const positions = kanban.data.data.map((item) => item.position).sort((a, b) => a - b);
  assert.deepEqual(positions, positions.map((_, index) => index));

  const content = await request('/api/contents', {
    token: staffToken, method: 'POST',
    body: { project_id: 1, platform_id: platformId, title: 'API test content', target_url: 'https://northstar.example' }
  });
  assert.equal(content.response.status, 201);
  const contentUpdate = await request(`/api/contents/${content.data.id}`, {
    token: staffToken, method: 'PATCH', body: { status: 'ready', is_used: true }
  });
  assert.equal(contentUpdate.data.status, 'ready');
  assert.equal(contentUpdate.data.is_used, 1);

  assert.equal((await request(`/api/platforms/${platformId}`, { token: managerToken, method: 'DELETE' })).response.status, 200);
  assert.equal((await request(`/api/tasks/${task.data.id}`, { token: managerToken, method: 'DELETE' })).response.status, 200);
  assert.equal((await request(`/api/contents/${content.data.id}`, { token: managerToken, method: 'DELETE' })).response.status, 200);
});

test('admin-only user management never exposes password hashes', async () => {
  const denied = await request('/api/users', { token: staffToken });
  assert.equal(denied.response.status, 403);

  const created = await request('/api/users', {
    token: adminToken, method: 'POST',
    body: {
      username: 'api-user', full_name: 'API User', email: 'api-user@linkhub.demo',
      password: 'TestPassword123', role: 'staff'
    }
  });
  assert.equal(created.response.status, 201);
  assert.equal(Object.hasOwn(created.data, 'password_hash'), false);

  const updated = await request(`/api/users/${created.data.id}`, {
    token: adminToken, method: 'PATCH', body: { is_active: false }
  });
  assert.equal(updated.data.is_active, false);
  const disabled = await request(`/api/users/${created.data.id}`, { token: adminToken });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.data.is_active, false);
  assert.equal((await request(`/api/users/${created.data.id}`, { token: adminToken, method: 'DELETE' })).response.status, 200);
});

test('invalid input, profile and link workflows return explicit results', async () => {
  const invalid = await request('/api/projects', {
    token: adminToken, method: 'POST', body: { name: 'Invalid URL', website_url: 'javascript:alert(1)' }
  });
  assert.equal(invalid.response.status, 400);

  const profile = await request('/api/profiles', {
    token: staffToken, method: 'POST',
    body: { project_id: 1, platform_id: 12, name: 'API profile', profile_url: 'https://profile.example/demo' }
  });
  assert.equal(profile.response.status, 201);

  const duplicate = await request('/api/profiles', {
    token: staffToken, method: 'POST',
    body: { project_id: 1, platform_id: 12, name: 'Duplicate profile' }
  });
  assert.equal(duplicate.response.status, 409);

  const mismatch = await request('/api/links', {
    token: staffToken, method: 'POST',
    body: {
      project_id: 2, platform_id: 2, profile_id: 1,
      source_url: 'https://source.example', target_url: 'https://greenfield.example'
    }
  });
  assert.equal(mismatch.response.status, 400);

  const check = await request('/api/links/1/check', { token: staffToken, method: 'POST', body: {} });
  assert.equal(check.response.status, 200);
  assert.equal(check.data.status, 'active');
  assert.match(check.data.check_note, /not verified on the Internet/i);
});

test('report export creates real xlsx and pdf files and records history', async () => {
  const cases = [
    { report_type: 'overview', format: 'xlsx' },
    { report_type: 'project', format: 'xlsx', project_id: 1 },
    { report_type: 'platform', format: 'xlsx', platform_id: 1 },
    {
      report_type: 'period', format: 'pdf',
      start_date: '2000-01-01', end_date: '2099-12-31'
    }
  ];
  for (const options of cases) {
    const { response, data } = await request('/api/reports/export', {
      token: managerToken, method: 'POST', body: options
    });
    assert.equal(response.status, 200);
    assert.ok(Buffer.isBuffer(data));
    if (options.format === 'xlsx') {
      assert.equal(data.subarray(0, 2).toString(), 'PK');
      const workbook = readZipEntry(data, 'xl/workbook.xml');
      assert.equal((workbook.match(/<sheet /g) || []).length, 4);
    } else {
      assert.equal(data.subarray(0, 5).toString(), '%PDF-');
      const pdf = data.toString('latin1');
      assert.match(pdf, /\/MediaBox \[0 0 842 595\]/);
      assert.ok((pdf.match(/\/Type \/Page /g) || []).length >= 1);
    }
  }
  const invalid = await request('/api/reports/export', {
    token: managerToken, method: 'POST', body: { format: 'xlsx', start_date: '2025-12-31', end_date: '2025-01-01' }
  });
  assert.equal(invalid.response.status, 400);
  const history = await request('/api/reports', { token: managerToken });
  assert.equal(history.response.status, 200);
  assert.equal(history.data.pagination.total, 4);
  assert.deepEqual(
    new Set(history.data.data.map((report) => report.report_type)),
    new Set(['overview', 'project', 'platform', 'period'])
  );
});
