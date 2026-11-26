import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, seedDatabase } from './db.js';
import { createToken, hashPassword, verifyPassword, verifyToken } from './auth.js';
import { createPdf, createXlsx } from './export.js';
import { localizeError } from './messages.js';

const root = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envFile = resolve(root, '../.env');
  if (!existsSync(envFile)) return;
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadEnv();

const secret = process.env.JWT_SECRET || '';
const ttlSeconds = Number.parseInt(process.env.JWT_TTL_SECONDS || '28800', 10);
if (secret.length < 24) throw new Error('Set JWT_SECRET to a secret of at least 24 characters in server/.env');
if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60) throw new Error('JWT_TTL_SECONDS must be an integer of at least 60');

const db = openDatabase();
seedDatabase(db);
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const collections = {
  projects: {
    table: 'projects',
    fields: ['name', 'description', 'industry', 'website_url', 'main_keywords', 'secondary_keywords', 'introduction', 'logo_url', 'status', 'owner_id'],
    required: ['name', 'website_url'],
    enums: { status: ['planning', 'active', 'paused', 'completed'] },
    search: ['name', 'industry', 'website_url'],
    roles: { create: ['admin', 'manager'], update: ['admin', 'manager'], delete: ['admin', 'manager'] }
  },
  platforms: {
    table: 'platforms',
    fields: ['name', 'url', 'category', 'description', 'link_types', 'priority', 'status', 'notes'],
    required: ['name', 'url', 'category'],
    enums: { priority: ['low', 'medium', 'high'], status: ['active', 'inactive', 'research'] },
    search: ['name', 'category', 'url'],
    roles: { create: ['admin', 'manager'], update: ['admin', 'manager'], delete: ['admin', 'manager'] }
  },
  profiles: {
    table: 'profiles',
    fields: ['project_id', 'platform_id', 'name', 'profile_url', 'brand_name', 'description', 'avatar_url', 'verification_status', 'status'],
    required: ['project_id', 'platform_id', 'name'],
    enums: {
      verification_status: ['unverified', 'verified', 'rejected'],
      status: ['not_started', 'in_progress', 'pending_review', 'completed', 'rejected', 'needs_update']
    },
    search: ['name', 'brand_name', 'profile_url'],
    roles: { create: ['admin', 'manager', 'staff'], update: ['admin', 'manager', 'staff'], delete: ['admin', 'manager', 'staff'] }
  },
  links: {
    table: 'links',
    fields: ['project_id', 'platform_id', 'profile_id', 'source_url', 'target_url', 'link_type', 'anchor_text', 'status', 'check_note', 'notes'],
    required: ['project_id', 'platform_id', 'source_url', 'target_url'],
    enums: { status: ['active', 'unverified', 'unreachable', 'removed', 'recheck'] },
    search: ['source_url', 'target_url', 'anchor_text'],
    roles: { create: ['admin', 'manager', 'staff'], update: ['admin', 'manager', 'staff'], delete: ['admin', 'manager', 'staff'] }
  },
  tasks: {
    table: 'tasks',
    fields: ['project_id', 'platform_id', 'assignee_id', 'title', 'description', 'category', 'due_date', 'priority', 'status', 'position'],
    required: ['project_id', 'assignee_id', 'title', 'category'],
    enums: {
      category: ['research', 'copywriting', 'assets', 'profile_setup', 'link_check', 'reporting'],
      priority: ['low', 'medium', 'high', 'urgent'],
      status: ['todo', 'in_progress', 'review', 'completed']
    },
    search: ['title', 'description'],
    roles: { create: ['admin', 'manager'], update: ['admin', 'manager'], delete: ['admin', 'manager'] }
  },
  contents: {
    table: 'contents',
    fields: ['project_id', 'platform_id', 'title', 'description', 'keywords', 'target_url', 'status', 'is_used'],
    required: ['project_id', 'title', 'target_url'],
    enums: { status: ['draft', 'review', 'ready', 'published', 'archived'] },
    search: ['title', 'description', 'keywords'],
    roles: { create: ['admin', 'manager', 'staff'], update: ['admin', 'manager', 'staff'], delete: ['admin', 'manager', 'staff'] }
  }
};

const userFields = ['username', 'full_name', 'email', 'role', 'is_active'];
const failedLogins = new Map();
const loginWindowMs = 5 * 60 * 1000;
const maxFailedLogins = 8;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function asNumber(value, name) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new HttpError(400, `${name} must be a positive integer`);
  return number;
}

function getPagination(params) {
  const rawPage = params.get('page') || '1';
  const rawLimit = params.get('limit') || '20';
  const requestedPage = Number(rawPage);
  const requestedLimit = Number(rawLimit);
  if (!Number.isSafeInteger(requestedPage) || requestedPage < 1 ||
      !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
    throw new HttpError(400, 'page and limit must be positive integers');
  }
  return { page: requestedPage, limit: Math.min(100, requestedLimit) };
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    is_active: Boolean(user.is_active),
    created_at: user.created_at
  };
}

function recordActivity(userId, action, entityType, entityId, message) {
  db.prepare(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, message)
    VALUES (?, ?, ?, ?, ?)`).run(userId, action, entityType, entityId ?? null, message);
}

function jsonResponse(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function binaryResponse(res, status, contentType, filename, data) {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': data.length,
    'Cache-Control': 'no-store'
  });
  res.end(data);
}

async function readJson(req) {
  const chunks = [];
  let length = 0;
  let tooLarge = false;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > 1024 * 1024) {
      tooLarge = true;
      chunks.length = 0;
      continue;
    }
    if (!tooLarge) chunks.push(chunk);
  }
  if (tooLarge) throw new HttpError(413, 'Request body exceeds 1 MB');
  if (length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Expected JSON object');
    return value;
  } catch {
    throw new HttpError(400, 'Request body must be a valid JSON object');
  }
}

function requireRole(user, roles) {
  if (!roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to perform this action');
}

function validateUrl(value, field) {
  if (typeof value !== 'string' || value.length > 2048) throw new HttpError(400, `${field} must be a URL`);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new HttpError(400, `${field} must be a valid URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new HttpError(400, `${field} must use HTTP or HTTPS`);
}

function validatePayload(config, input, partial) {
  const payload = {};
  for (const field of config.fields) {
    if (Object.hasOwn(input, field)) payload[field] = input[field];
  }
  if (!partial) {
    for (const field of config.required) {
      if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
        throw new HttpError(400, `${field} is required`);
      }
    }
  }
  for (const [field, values] of Object.entries(config.enums || {})) {
    if (payload[field] !== undefined && !values.includes(payload[field])) {
      throw new HttpError(400, `${field} must be one of: ${values.join(', ')}`);
    }
  }
  const nullableFields = config.table === 'links'
    ? ['profile_id']
    : config.table === 'tasks' || config.table === 'contents'
      ? ['platform_id', ...(config.table === 'tasks' ? ['due_date'] : [])]
      : [];
  for (const field of ['website_url', 'url', 'profile_url', 'source_url', 'target_url', 'avatar_url', 'logo_url']) {
    if (payload[field]) validateUrl(payload[field], field);
  }
  for (const field of config.fields) {
    const value = payload[field];
    if (value === null && !nullableFields.includes(field)) throw new HttpError(400, `${field} cannot be null`);
    if (value !== undefined && value !== null && typeof value === 'string' && value.length > 10000) {
      throw new HttpError(400, `${field} must be at most 10000 characters`);
    }
    if (value !== undefined && value !== null && !['project_id', 'platform_id', 'profile_id', 'owner_id', 'assignee_id', 'position', 'is_used'].includes(field) && typeof value !== 'string') {
      throw new HttpError(400, `${field} must be a string`);
    }
    if (config.required.includes(field) && typeof value === 'string' && !value.trim()) {
      throw new HttpError(400, `${field} cannot be empty`);
    }
  }
  if (payload.is_used !== undefined && ![0, 1, true, false].includes(payload.is_used)) {
    throw new HttpError(400, 'is_used must be a boolean');
  }
  if (payload.is_used !== undefined) payload.is_used = payload.is_used ? 1 : 0;
  for (const field of ['project_id', 'platform_id', 'profile_id', 'owner_id', 'assignee_id', 'position']) {
    if (payload[field] !== undefined && payload[field] !== null) {
      if (field === 'position') {
        const position = Number(payload[field]);
        if (!Number.isSafeInteger(position) || position < 0) throw new HttpError(400, 'position must be a non-negative integer');
        payload[field] = position;
      } else {
        payload[field] = asNumber(payload[field], field);
      }
    }
  }
  if (payload.due_date !== undefined && payload.due_date !== null &&
      !validDate(payload.due_date)) {
    throw new HttpError(400, 'due_date must use YYYY-MM-DD format');
  }
  return payload;
}

function activityName(entity) {
  return entity.endsWith('s') ? entity.slice(0, -1) : entity;
}

function listCollection(entity, config, url, user) {
  const params = url.searchParams;
  const { page, limit } = getPagination(params);
  const where = [];
  const values = [];
  const projectId = params.get('project_id');
  if (projectId && config.fields.includes('project_id')) {
    where.push('project_id = ?');
    values.push(asNumber(projectId, 'project_id'));
  }
  const status = params.get('status');
  if (status && config.fields.includes('status')) {
    where.push('status = ?');
    values.push(status);
  }
  for (const field of ['category', 'priority']) {
    const filterValue = params.get(field);
    if (filterValue && config.fields.includes(field)) {
      where.push(`${field} = ?`);
      values.push(filterValue);
    }
  }
  if (entity === 'tasks' && user.role === 'staff') {
    where.push('assignee_id = ?');
    values.push(user.id);
  }
  const query = params.get('q');
  if (query && config.search.length) {
    where.push(`(${config.search.map((field) => `COALESCE(${field}, '') LIKE ?`).join(' OR ')})`);
    values.push(...config.search.map(() => `%${query.slice(0, 100)}%`));
  }
  const sort = params.get('sort') || 'id';
  const allowedSorts = new Set(['id', ...config.fields]);
  if (!allowedSorts.has(sort)) throw new HttpError(400, 'sort must be a supported field');
  const direction = (params.get('direction') || 'desc').toLowerCase();
  if (!['asc', 'desc'].includes(direction)) throw new HttpError(400, 'direction must be asc or desc');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM ${config.table} ${clause}`).get(...values).count;
  const rows = db.prepare(`SELECT * FROM ${config.table} ${clause}
    ORDER BY ${sort} ${direction.toUpperCase()}${sort === 'id' ? '' : ', id DESC'} LIMIT ? OFFSET ?`)
    .all(...values, limit, (page - 1) * limit);
  const data = entity === 'users' ? rows.map(publicUser) : rows;
  return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

function getDashboard() {
  const count = (table, where = '') => db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get().count;
  const taskTotal = count('tasks');
  const taskCompleted = count('tasks', "WHERE status = 'completed'");
  return {
    totals: {
      projects: count('projects'),
      platforms: count('platforms'),
      profiles: count('profiles'),
      completed_profiles: count('profiles', "WHERE status = 'completed'"),
      in_progress_profiles: count('profiles', "WHERE status = 'in_progress'"),
      links: count('links'),
      active_links: count('links', "WHERE status = 'active'"),
      tasks: taskTotal,
      completed_tasks: taskCompleted,
      completion_rate: taskTotal ? Math.round((taskCompleted / taskTotal) * 100) : 0
    },
    links_by_status: db.prepare('SELECT status, COUNT(*) AS count FROM links GROUP BY status ORDER BY status').all(),
    platforms_by_category: db.prepare(`SELECT category, COUNT(*) AS count FROM platforms
      GROUP BY category ORDER BY count DESC`).all(),
    progress_by_day: db.prepare(`SELECT substr(COALESCE(completed_at, updated_at), 1, 10) AS date, COUNT(*) AS count
      FROM tasks WHERE status = 'completed' GROUP BY date ORDER BY date DESC LIMIT 14`).all().reverse(),
    upcoming_tasks: db.prepare(`SELECT t.id, t.title, t.due_date, t.priority, t.status, p.name AS project_name,
      u.full_name AS assignee_name FROM tasks t JOIN projects p ON p.id = t.project_id
      JOIN users u ON u.id = t.assignee_id WHERE t.status != 'completed'
      AND t.due_date IS NOT NULL ORDER BY t.due_date LIMIT 8`).all(),
    latest_activity: db.prepare(`SELECT a.id, a.action, a.entity_type, a.entity_id, a.message, a.created_at,
      u.full_name AS user_name FROM activity_logs a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT 8`).all()
  };
}

const linkStatusLabels = {
  active: 'Đang hoạt động',
  unverified: 'Chưa xác minh',
  unreachable: 'Không truy cập được',
  removed: 'Đã gỡ bỏ',
  recheck: 'Cần kiểm tra lại'
};
const taskStatusLabels = {
  todo: 'Cần thực hiện',
  in_progress: 'Đang thực hiện',
  review: 'Chờ duyệt',
  completed: 'Hoàn thành'
};

function buildReport({ projectId, platformId, startDate, endDate }) {
  function filterFor(table, dateColumn, { includeProject = true, includePlatform = true, alias = table } = {}) {
    const conditions = [];
    const values = [];
    if (projectId && includeProject && table !== 'projects' && table !== 'platforms') {
      conditions.push(`${alias}.project_id = ?`);
      values.push(projectId);
    } else if (projectId && table === 'projects') {
      conditions.push(`${alias}.id = ?`);
      values.push(projectId);
    }
    if (platformId && includePlatform && ['profiles', 'links', 'tasks', 'contents'].includes(table)) {
      conditions.push(`${alias}.platform_id = ?`);
      values.push(platformId);
    } else if (platformId && table === 'platforms') {
      conditions.push(`${alias}.id = ?`);
      values.push(platformId);
    }
    if (startDate) {
      conditions.push(`substr(${alias}.${dateColumn}, 1, 10) >= ?`);
      values.push(startDate);
    }
    if (endDate) {
      conditions.push(`substr(${alias}.${dateColumn}, 1, 10) <= ?`);
      values.push(endDate);
    }
    return { clause: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values };
  }

  function count(table, dateColumn, extra = '', options) {
    const filter = filterFor(table, dateColumn, options);
    const where = [filter.clause.replace(/^WHERE\s*/, ''), extra].filter(Boolean).join(' AND ');
    return db.prepare(`SELECT COUNT(*) AS count FROM ${table}${where ? ` WHERE ${where}` : ''}`)
      .get(...filter.values).count;
  }

  const projectTotal = count('projects', 'created_at', '', { includePlatform: false });
  const completedProjectTotal = count('projects', 'created_at', "status = 'completed'", { includePlatform: false });
  const taskTotal = count('tasks', 'created_at');
  const completedTaskTotal = count('tasks', 'created_at', "status = 'completed'");
  const deployedFilter = filterFor('profiles', 'updated_at');
  const deployedPlatforms = db.prepare(`SELECT COUNT(DISTINCT platform_id) AS count FROM profiles
    ${deployedFilter.clause ? `${deployedFilter.clause} AND` : 'WHERE'} status = 'completed' AND verification_status = 'verified'`)
    .get(...deployedFilter.values).count;
  const metrics = {
    'Tổng số dự án': projectTotal,
    'Tổng số nền tảng': count('platforms', 'created_at'),
    'Nền tảng đã triển khai': deployedPlatforms,
    'Tổng số hồ sơ': count('profiles', 'created_at'),
    'Hồ sơ hoàn thành': count('profiles', 'created_at', "status = 'completed'"),
    'Tổng số liên kết': count('links', 'recorded_at'),
    'Liên kết đang hoạt động': count('links', 'recorded_at', "status = 'active'"),
    'Tổng số công việc': taskTotal,
    'Công việc hoàn thành': completedTaskTotal,
    'Tỷ lệ hoàn thành dự án (%)': projectTotal
      ? Math.round((completedProjectTotal / projectTotal) * 100)
      : 0,
    'Tỷ lệ hoàn thành công việc (%)': taskTotal
      ? Math.round((completedTaskTotal / taskTotal) * 100)
      : 0
  };

  const profileFilter = filterFor('profiles', 'created_at', { alias: 'pr' });
  const linkFilter = filterFor('links', 'recorded_at', { alias: 'l' });
  const platformWhere = platformId ? 'WHERE pl.id = ?' : '';
  const platformRows = db.prepare(`SELECT pl.name AS platform,
    (SELECT COUNT(*) FROM profiles pr WHERE pr.platform_id = pl.id
      ${profileFilter.clause ? `AND ${profileFilter.clause.slice(6)}` : ''}) AS profiles,
    (SELECT COUNT(*) FROM profiles pr WHERE pr.platform_id = pl.id
      ${profileFilter.clause ? `AND ${profileFilter.clause.slice(6)} AND` : 'AND'} pr.status = 'completed') AS completed_profiles,
    (SELECT COUNT(*) FROM links l WHERE l.platform_id = pl.id
      ${linkFilter.clause ? `AND ${linkFilter.clause.slice(6)}` : ''}) AS links,
    (SELECT COUNT(*) FROM links l WHERE l.platform_id = pl.id
      ${linkFilter.clause ? `AND ${linkFilter.clause.slice(6)} AND` : 'AND'} l.status = 'active') AS active_links
    FROM platforms pl ${platformWhere} ORDER BY pl.name`).all(
    ...profileFilter.values, ...profileFilter.values,
    ...linkFilter.values, ...linkFilter.values,
    ...(platformId ? [platformId] : [])
  );
  const linkStatusFilter = filterFor('links', 'recorded_at');
  const linksByStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM links
    ${linkStatusFilter.clause} GROUP BY status ORDER BY status`).all(...linkStatusFilter.values)
    .map((row) => ({ status: linkStatusLabels[row.status] || row.status, count: row.count }));
  const taskStatusFilter = filterFor('tasks', 'created_at');
  const tasksByStatus = db.prepare(`SELECT status, COUNT(*) AS count FROM tasks
    ${taskStatusFilter.clause} GROUP BY status ORDER BY status`).all(...taskStatusFilter.values)
    .map((row) => ({ status: taskStatusLabels[row.status] || row.status, count: row.count }));

  const weeklyActivity = [];
  const weeks = new Map();
  const addWeeklyCounts = (table, dateColumn, key, extra = '') => {
    const filter = filterFor(table, dateColumn);
    const clause = [filter.clause.replace(/^WHERE\s*/, ''), extra].filter(Boolean).join(' AND ');
    const weekStart = `date(${table}.${dateColumn}, '-' || ((CAST(strftime('%w', ${table}.${dateColumn}) AS INTEGER) + 6) % 7) || ' days')`;
    const rows = db.prepare(`SELECT ${weekStart} AS week_start, COUNT(*) AS count
      FROM ${table}${clause ? ` WHERE ${clause}` : ''}
      GROUP BY week_start ORDER BY week_start`).all(...filter.values);
    for (const row of rows) {
      if (!weeks.has(row.week_start)) {
        weeks.set(row.week_start, { week_start: row.week_start, profiles_deployed: 0, links_recorded: 0, tasks_completed: 0 });
      }
      weeks.get(row.week_start)[key] = row.count;
    }
  };
  if (startDate || endDate) {
    addWeeklyCounts('profiles', 'updated_at', 'profiles_deployed', "status = 'completed' AND verification_status = 'verified'");
    addWeeklyCounts('links', 'recorded_at', 'links_recorded');
    addWeeklyCounts('tasks', 'completed_at', 'tasks_completed', "status = 'completed' AND completed_at IS NOT NULL");
    weeklyActivity.push(...[...weeks.values()].sort((a, b) => a.week_start.localeCompare(b.week_start)));
  }

  return { metrics, platforms: platformRows, linksByStatus, tasksByStatus, weeklyActivity };
}

function reportRows(report) {
  return report.platforms.map((row) => ({
    'Nền tảng': row.platform,
    'Tổng số hồ sơ': row.profiles || 0,
    'Hồ sơ hoàn thành': row.completed_profiles || 0,
    'Tổng số liên kết': row.links || 0,
    'Liên kết đang hoạt động': row.active_links || 0
  }));
}

function validateAssociations(entity, payload, existing = {}) {
  if (entity === 'profiles') {
    const status = payload.status ?? existing.status ?? 'not_started';
    const verificationStatus = payload.verification_status ?? existing.verification_status ?? 'unverified';
    const profileUrl = Object.hasOwn(payload, 'profile_url') ? payload.profile_url : existing.profile_url;
    if ((status === 'completed' || verificationStatus === 'verified') && !profileUrl?.trim()) {
      throw new HttpError(400, 'Completed or verified profiles require a profile URL');
    }
    return;
  }
  if (entity !== 'links') return;
  const projectId = payload.project_id ?? existing.project_id;
  const platformId = payload.platform_id ?? existing.platform_id;
  const profileId = Object.hasOwn(payload, 'profile_id') ? payload.profile_id : existing.profile_id;
  const sourceUrl = payload.source_url ?? existing.source_url;
  const targetUrl = payload.target_url ?? existing.target_url;
  if (sourceUrl && targetUrl) {
    const normalizedSource = new URL(sourceUrl);
    const normalizedTarget = new URL(targetUrl);
    normalizedSource.hash = '';
    normalizedTarget.hash = '';
    if (normalizedSource.href === normalizedTarget.href) {
      throw new HttpError(400, 'Source and target URLs must be different');
    }
  }
  if (profileId) {
    const profile = db.prepare('SELECT project_id, platform_id FROM profiles WHERE id = ?').get(profileId);
    if (!profile) throw new HttpError(400, 'profile_id does not reference an existing profile');
    if (profile.project_id !== projectId || profile.platform_id !== platformId) {
      throw new HttpError(400, 'The linked profile must belong to the same project and platform');
    }
  }
}

function normalizeTaskColumn(projectId, status, taskId, targetPosition) {
  const taskIds = db.prepare(`SELECT id FROM tasks
    WHERE project_id = ? AND status = ? AND id != ? ORDER BY position, id`)
    .all(projectId, status, taskId).map((task) => task.id);
  const position = Math.max(0, Math.min(targetPosition, taskIds.length));
  taskIds.splice(position, 0, taskId);
  const updatePosition = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
  taskIds.forEach((id, index) => updatePosition.run(index, id));
}

function createTaskRecord(payload) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const fields = Object.keys(payload);
    const placeholders = fields.map(() => '?').join(', ');
    const result = db.prepare(`INSERT INTO tasks (${fields.join(', ')}) VALUES (${placeholders})`)
      .run(...fields.map((field) => payload[field]));
    const id = Number(result.lastInsertRowid);
    const status = payload.status || 'todo';
    const targetPosition = payload.position ?? db.prepare(`SELECT COUNT(*) AS count FROM tasks
      WHERE project_id = ? AND status = ? AND id != ?`).get(payload.project_id, status, id).count;
    normalizeTaskColumn(payload.project_id, status, id, targetPosition);
    db.exec('COMMIT');
    return id;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function updateTaskRecord(id, payload, user) {
  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!existing) throw new HttpError(404, 'Task not found');
  const targetProjectId = payload.project_id ?? existing.project_id;
  const targetStatus = payload.status ?? existing.status;
  const groupChanged = targetProjectId !== existing.project_id || targetStatus !== existing.status;
  const changingColumn = groupChanged || payload.position !== undefined;
  const changes = Object.fromEntries(Object.entries(payload).filter(([field]) => !['status', 'position'].includes(field)));

  db.exec('BEGIN IMMEDIATE');
  try {
    if (groupChanged) {
      const oldTaskIds = db.prepare(`SELECT id FROM tasks
        WHERE project_id = ? AND status = ? AND id != ? ORDER BY position, id`)
        .all(existing.project_id, existing.status, id);
      const updatePosition = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
      oldTaskIds.forEach((task, index) => updatePosition.run(index, task.id));
    }

    const targetPosition = payload.position ?? (groupChanged
      ? db.prepare(`SELECT COUNT(*) AS count FROM tasks WHERE project_id = ? AND status = ? AND id != ?`)
        .get(targetProjectId, targetStatus, id).count
      : existing.position);
    if (payload.status !== undefined) {
      changes.status = targetStatus;
      changes.completed_at = targetStatus === 'completed'
        ? (existing.completed_at || new Date().toISOString())
        : null;
    }
    changes.updated_at = new Date().toISOString();
    const fields = Object.keys(changes);
    if (fields.length) {
      const assignments = fields.map((field) => `${field} = ?`).join(', ');
      db.prepare(`UPDATE tasks SET ${assignments} WHERE id = ?`).run(...fields.map((field) => changes[field]), id);
    }

    if (changingColumn) normalizeTaskColumn(targetProjectId, targetStatus, id, targetPosition);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error.message).includes('FOREIGN KEY constraint failed')) {
      throw new HttpError(400, 'A referenced project, platform, or user does not exist');
    }
    throw error;
  }
  recordActivity(user.id, 'update', 'task', id, `Updated task ${id}`);
}

async function route(req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
    decodeURIComponent(url.pathname);
  } catch {
    throw new HttpError(400, 'Malformed request URL');
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = req.method || 'GET';
  const origin = req.headers.origin;

  res.setHeader('Vary', 'Origin');
  if (origin) {
    if (!allowedOrigins.has(origin)) throw new HttpError(403, 'Origin is not allowed');
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    });
    res.end();
    return;
  }
  if (path === '/api/health' && method === 'GET') {
    jsonResponse(res, 200, { status: 'ok', database: 'connected' });
    return;
  }

  if (path === '/api/auth/login' && method === 'POST') {
    const body = await readJson(req);
    if (typeof body.username !== 'string' || typeof body.password !== 'string') {
      throw new HttpError(400, 'username and password are required');
    }
    const now = Date.now();
    for (const [key, state] of failedLogins) {
      if (state.blockedUntil <= now && now - state.windowStart > loginWindowMs) failedLogins.delete(key);
    }
    const key = `${req.socket.remoteAddress || 'unknown'}:${body.username.toLowerCase().slice(0, 128)}`;
    const state = failedLogins.get(key);
    if (state?.blockedUntil > now) throw new HttpError(429, 'Too many failed sign-in attempts; try again in five minutes');
    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(body.username);
    if (!user || !user.is_active || !verifyPassword(body.password, user.password_hash)) {
      const current = state && now - state.windowStart <= loginWindowMs
        ? state
        : { attempts: 0, windowStart: now, blockedUntil: 0 };
      current.attempts += 1;
      if (current.attempts >= maxFailedLogins) current.blockedUntil = now + loginWindowMs;
      failedLogins.set(key, current);
      if (failedLogins.size > 10000) failedLogins.delete(failedLogins.keys().next().value);
      throw new HttpError(401, 'Invalid username or password');
    }
    failedLogins.delete(key);
    recordActivity(user.id, 'login', 'user', user.id, 'User signed in');
    jsonResponse(res, 200, { token: createToken(user, secret, ttlSeconds), user: publicUser(user) });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const claims = verifyToken(token, secret);
  if (!claims) throw new HttpError(401, 'A valid Bearer token is required');
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(claims.sub);
  if (!user) throw new HttpError(401, 'User is no longer active');

  if (path === '/api/auth/me' && method === 'GET') {
    jsonResponse(res, 200, { user: publicUser(user) });
    return;
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    recordActivity(user.id, 'logout', 'user', user.id, 'User signed out; token expires naturally');
    jsonResponse(res, 200, { message: 'Signed out' });
    return;
  }
  if (path === '/api/dashboard' && method === 'GET') {
    jsonResponse(res, 200, getDashboard());
    return;
  }

  const reportMatch = path.match(/^\/api\/reports(?:\/(\d+))?$/);
  if (reportMatch) {
    requireRole(user, ['admin', 'manager']);
    if (method === 'GET' && !reportMatch[1]) {
      const { page, limit } = getPagination(url.searchParams);
      const total = db.prepare('SELECT COUNT(*) AS count FROM reports').get().count;
      const data = db.prepare(`SELECT r.*, u.full_name AS created_by_name FROM reports r
        JOIN users u ON u.id = r.created_by ORDER BY r.id DESC LIMIT ? OFFSET ?`)
        .all(limit, (page - 1) * limit);
      jsonResponse(res, 200, { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
      return;
    }
    if (method === 'GET' && reportMatch[1]) {
      const item = db.prepare('SELECT * FROM reports WHERE id = ?').get(asNumber(reportMatch[1], 'id'));
      if (!item) throw new HttpError(404, 'Report not found');
      jsonResponse(res, 200, item);
      return;
    }
  }

  if (path === '/api/reports/export' && method === 'POST') {
    requireRole(user, ['admin', 'manager']);
    const body = await readJson(req);
    const format = body.format;
    if (!['xlsx', 'pdf'].includes(format)) throw new HttpError(400, 'format must be xlsx or pdf');
    const projectId = body.project_id === undefined || body.project_id === null ? null : asNumber(body.project_id, 'project_id');
    const platformId = body.platform_id === undefined || body.platform_id === null ? null : asNumber(body.platform_id, 'platform_id');
    const startDate = body.start_date ?? null;
    const endDate = body.end_date ?? null;
    for (const [field, value] of [['start_date', startDate], ['end_date', endDate]]) {
      if (value !== null && !validDate(value)) {
        throw new HttpError(400, `${field} must use YYYY-MM-DD format`);
      }
    }
    if (startDate && endDate && startDate > endDate) throw new HttpError(400, 'start_date must be on or before end_date');
    const inferredReportType = platformId ? 'platform' : (startDate || endDate ? 'period' : projectId ? 'project' : 'overview');
    const reportType = body.report_type || inferredReportType;
    if (!['overview', 'project', 'platform', 'period'].includes(reportType)) {
      throw new HttpError(400, 'report_type must be overview, project, platform, or period');
    }
    if (reportType === 'project' && !projectId) throw new HttpError(400, 'project_id is required for a project report');
    if (reportType === 'platform' && !platformId) throw new HttpError(400, 'platform_id is required for a platform report');
    if (reportType === 'period' && !startDate && !endDate) throw new HttpError(400, 'start_date or end_date is required for a period report');
    if (projectId && !db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)) {
      throw new HttpError(404, 'Project not found');
    }
    if (platformId && !db.prepare('SELECT id FROM platforms WHERE id = ?').get(platformId)) {
      throw new HttpError(404, 'Platform not found');
    }
    const report = buildReport({ projectId, platformId, startDate, endDate });
    const projectName = projectId ? db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId).name : '';
    const platformName = platformId ? db.prepare('SELECT name FROM platforms WHERE id = ?').get(platformId).name : '';
    const title = reportType === 'project'
      ? `Báo cáo dự án: ${projectName}`
      : reportType === 'platform'
        ? `Báo cáo nền tảng: ${platformName}`
        : reportType === 'period'
          ? 'Báo cáo theo thời gian'
          : 'Báo cáo tổng hợp';
    const params = JSON.stringify({
      report_type: reportType,
      project_id: projectId,
      platform_id: platformId,
      start_date: startDate,
      end_date: endDate
    });
    const inserted = db.prepare(`INSERT INTO reports
      (project_id, title, report_type, params_json, format, created_by) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(projectId, title, reportType, params, format, user.id);
    recordActivity(user.id, 'export', 'report', Number(inserted.lastInsertRowid), `Đã xuất báo cáo ${format.toUpperCase()}.`);
    if (format === 'xlsx') {
      const sheets = [
        {
          name: 'Tổng quan',
          headers: ['Chỉ số', 'Giá trị'],
          rows: Object.entries(report.metrics).map(([metric, value]) => ({ 'Chỉ số': metric, 'Giá trị': value }))
        },
        {
          name: 'Nền tảng',
          headers: ['Nền tảng', 'Tổng số hồ sơ', 'Hồ sơ hoàn thành', 'Tổng số liên kết', 'Liên kết đang hoạt động'],
          rows: reportRows(report)
        },
        {
          name: 'Trạng thái liên kết',
          headers: ['Trạng thái', 'Số lượng'],
          rows: report.linksByStatus.map((row) => ({ 'Trạng thái': row.status, 'Số lượng': row.count }))
        },
        {
          name: 'Trạng thái công việc',
          headers: ['Trạng thái', 'Số lượng'],
          rows: report.tasksByStatus.map((row) => ({ 'Trạng thái': row.status, 'Số lượng': row.count }))
        }
      ];
      if (reportType === 'period') {
        sheets.push({
          name: 'Xu hướng theo tuần',
          headers: ['Tuần bắt đầu', 'Hồ sơ triển khai', 'Liên kết ghi nhận', 'Công việc hoàn thành'],
          rows: report.weeklyActivity.map((row) => ({
            'Tuần bắt đầu': row.week_start,
            'Hồ sơ triển khai': row.profiles_deployed,
            'Liên kết ghi nhận': row.links_recorded,
            'Công việc hoàn thành': row.tasks_completed
          }))
        });
      }
      const data = createXlsx(sheets);
      binaryResponse(res, 200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'linkhub-report.xlsx', data);
      return;
    }
    const metrics = Object.entries(report.metrics).map(([key, value]) => `${key}: ${value}`);
    const platforms = reportRows(report).map((row) =>
      `${row['Nền tảng']} | hồ sơ ${row['Tổng số hồ sơ']} (${row['Hồ sơ hoàn thành']} hoàn thành) | liên kết ${row['Tổng số liên kết']} (${row['Liên kết đang hoạt động']} đang hoạt động)`
    );
    const linkStatuses = report.linksByStatus.map((row) => `Liên kết — ${row.status}: ${row.count}`);
    const taskStatuses = report.tasksByStatus.map((row) => `Công việc — ${row.status}: ${row.count}`);
    const weeklyActivity = report.weeklyActivity.flatMap((row) => [
      `Tuần bắt đầu ${row.week_start}: ${row.profiles_deployed} hồ sơ triển khai, ${row.links_recorded} liên kết ghi nhận, ${row.tasks_completed} công việc hoàn thành`
    ]);
    const data = createPdf(title, [
      ...metrics, '', 'Thống kê theo nền tảng', ...platforms, '',
      ...linkStatuses, ...taskStatuses,
      ...(reportType === 'period'
        ? ['', 'Xu hướng theo tuần', ...(weeklyActivity.length ? weeklyActivity : ['Không có hoạt động trong khoảng thời gian đã chọn.'])]
        : []),
      '', 'Trạng thái liên kết do người dùng ghi nhận; chưa được xác minh trên Internet.'
    ]);
    binaryResponse(res, 200, 'application/pdf', 'linkhub-report.pdf', data);
    return;
  }

  if (path === '/api/links/stats' && method === 'GET') {
    jsonResponse(res, 200, {
      by_status: db.prepare('SELECT status, COUNT(*) AS count FROM links GROUP BY status ORDER BY status').all(),
      by_platform: db.prepare(`SELECT p.id AS platform_id, p.name AS platform, COUNT(l.id) AS count,
        COALESCE(SUM(CASE WHEN l.status = 'active' THEN 1 ELSE 0 END), 0) AS active
        FROM platforms p LEFT JOIN links l ON l.platform_id = p.id
        GROUP BY p.id ORDER BY count DESC, p.name`).all()
    });
    return;
  }

  const checkMatch = path.match(/^\/api\/links\/(\d+)\/check$/);
  if (checkMatch && method === 'POST') {
    requireRole(user, ['admin', 'manager', 'staff']);
    const id = asNumber(checkMatch[1], 'id');
    const item = db.prepare('SELECT * FROM links WHERE id = ?').get(id);
    if (!item) throw new HttpError(404, 'Link not found');
    validateUrl(item.source_url, 'source_url');
    const checkedAt = new Date().toISOString();
    const note = 'URL format is valid. Demo check only; not verified on the Internet.';
    db.prepare('UPDATE links SET last_checked_at = ?, check_note = ? WHERE id = ?').run(checkedAt, note, id);
    recordActivity(user.id, 'check', 'link', id, `Ran demo URL format check for link ${id}`);
    jsonResponse(res, 200, { id, status: item.status, last_checked_at: checkedAt, check_note: note });
    return;
  }

  const collectionMatch = path.match(/^\/api\/([a-z-]+)(?:\/(\d+))?$/);
  if (!collectionMatch) throw new HttpError(404, 'Endpoint not found');
  const entity = collectionMatch[1];
  const id = collectionMatch[2] ? asNumber(collectionMatch[2], 'id') : null;

  if (entity === 'activity-logs') {
    requireRole(user, ['admin', 'manager', 'staff']);
    if (method !== 'GET' || id) throw new HttpError(405, 'Method not allowed');
    const { page, limit } = getPagination(url.searchParams);
    const staffOnly = user.role === 'staff';
    const filter = staffOnly ? 'WHERE a.user_id = ?' : '';
    const values = staffOnly ? [user.id] : [];
    const total = db.prepare(`SELECT COUNT(*) AS count FROM activity_logs a ${filter}`).get(...values).count;
    const data = db.prepare(`SELECT a.*, u.full_name AS user_name FROM activity_logs a
      LEFT JOIN users u ON u.id = a.user_id ${filter} ORDER BY a.id DESC LIMIT ? OFFSET ?`)
      .all(...values, limit, (page - 1) * limit);
    jsonResponse(res, 200, { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    return;
  }

  if (entity === 'users') {
    requireRole(user, ['admin']);
    if (!id && method === 'GET') {
      jsonResponse(res, 200, listCollection(entity, { table: 'users', fields: userFields, search: ['username', 'full_name', 'email'] }, url, user));
      return;
    }
    if (!id && method === 'POST') {
      const body = await readJson(req);
      for (const field of ['username', 'full_name', 'email', 'password', 'role']) {
        if (typeof body[field] !== 'string' || !body[field].trim()) throw new HttpError(400, `${field} is required`);
      }
      if (!['admin', 'manager', 'staff'].includes(body.role)) throw new HttpError(400, 'role must be admin, manager, or staff');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new HttpError(400, 'email must be valid');
      if (body.password.length < 10 || body.password.length > 256) throw new HttpError(400, 'password must contain 10 to 256 characters');
      let result;
      try {
        result = db.prepare(`INSERT INTO users (username, full_name, email, password_hash, role)
          VALUES (?, ?, ?, ?, ?)`).run(body.username.trim(), body.full_name.trim(), body.email.trim(), hashPassword(body.password), body.role);
      } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed')) throw new HttpError(409, 'Username or email is already in use');
        throw error;
      }
      const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
      recordActivity(user.id, 'create', 'user', newUser.id, `Created user ${newUser.username}`);
      jsonResponse(res, 201, publicUser(newUser));
      return;
    }
    if (id && method === 'GET') {
      const item = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!item) throw new HttpError(404, 'User not found');
      jsonResponse(res, 200, publicUser(item));
      return;
    }
    if (id && ['PUT', 'PATCH'].includes(method)) {
      const body = await readJson(req);
      const changes = {};
      for (const field of userFields) if (Object.hasOwn(body, field)) changes[field] = body[field];
      if (Object.hasOwn(body, 'password')) {
        if (typeof body.password !== 'string' || body.password.length < 10 || body.password.length > 256) throw new HttpError(400, 'password must contain 10 to 256 characters');
        changes.password_hash = hashPassword(body.password);
      }
      for (const field of ['username', 'full_name', 'email']) {
        if (changes[field] !== undefined && (typeof changes[field] !== 'string' || !changes[field].trim())) {
          throw new HttpError(400, `${field} must be a non-empty string`);
        }
      }
      if (changes.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(changes.email)) throw new HttpError(400, 'email must be valid');
      if (changes.role && !['admin', 'manager', 'staff'].includes(changes.role)) throw new HttpError(400, 'Invalid role');
      if (changes.is_active !== undefined) {
        if (![true, false, 0, 1].includes(changes.is_active)) throw new HttpError(400, 'is_active must be a boolean');
        changes.is_active = changes.is_active ? 1 : 0;
      }
      if (!Object.keys(changes).length) throw new HttpError(400, 'No supported fields to update');
      if (id === user.id && changes.is_active === 0) throw new HttpError(400, 'You cannot deactivate your own account');
      const assignments = Object.keys(changes).map((field) => `${field} = ?`).join(', ');
      try {
        db.prepare(`UPDATE users SET ${assignments} WHERE id = ?`).run(...Object.values(changes), id);
      } catch (error) {
        if (String(error.message).includes('UNIQUE constraint failed')) throw new HttpError(409, 'Username or email is already in use');
        throw error;
      }
      const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      if (!updated) throw new HttpError(404, 'User not found');
      recordActivity(user.id, 'update', 'user', id, `Updated user ${updated.username}`);
      jsonResponse(res, 200, publicUser(updated));
      return;
    }
    if (id && method === 'DELETE') {
      if (id === user.id) throw new HttpError(400, 'You cannot delete your own account');
      const target = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
      if (!target) throw new HttpError(404, 'User not found');
      try {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
      } catch (error) {
        if (String(error.message).includes('FOREIGN KEY constraint failed')) throw new HttpError(409, 'User is referenced by projects, tasks, content, reports, or activity');
        throw error;
      }
      recordActivity(user.id, 'delete', 'user', id, `Deleted user ${target.username}`);
      jsonResponse(res, 200, { message: 'User deleted' });
      return;
    }
    throw new HttpError(405, 'Method not allowed');
  }

  const config = collections[entity];
  if (!config) throw new HttpError(404, 'Collection not found');

  if (method === 'GET' && !id) {
    if (entity === 'tasks' && user.role === 'staff') {
      jsonResponse(res, 200, listCollection(entity, config, url, user));
      return;
    }
    jsonResponse(res, 200, listCollection(entity, config, url, user));
    return;
  }
  if (method === 'GET' && id) {
    const item = db.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(id);
    if (!item) throw new HttpError(404, `${activityName(entity)} not found`);
    if (entity === 'tasks' && user.role === 'staff' && item.assignee_id !== user.id) throw new HttpError(403, 'You can only view tasks assigned to you');
    jsonResponse(res, 200, item);
    return;
  }
  if (method === 'POST' && !id) {
    requireRole(user, config.roles.create);
    const body = await readJson(req);
    const payload = validatePayload(config, body, false);
    if (entity === 'projects' && payload.owner_id === undefined) payload.owner_id = user.id;
    if (entity === 'contents') payload.created_by = user.id;
    validateAssociations(entity, payload);
    let newId;
    try {
      if (entity === 'tasks') {
        newId = createTaskRecord(payload);
      } else {
        const fields = Object.keys(payload);
        if (!fields.length) throw new HttpError(400, 'No supported fields provided');
        const placeholders = fields.map(() => '?').join(', ');
        const result = db.prepare(`INSERT INTO ${config.table} (${fields.join(', ')}) VALUES (${placeholders})`)
          .run(...fields.map((field) => payload[field]));
        newId = Number(result.lastInsertRowid);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (String(error.message).includes('UNIQUE constraint failed')) throw new HttpError(409, 'A record with these values already exists');
      if (String(error.message).includes('FOREIGN KEY constraint failed')) throw new HttpError(400, 'A referenced project, platform, profile, or user does not exist');
      throw error;
    }
    recordActivity(user.id, 'create', activityName(entity), newId, `Created ${activityName(entity)} ${newId}`);
    jsonResponse(res, 201, db.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(newId));
    return;
  }
  if (['PUT', 'PATCH'].includes(method) && id) {
    const roles = config.roles.update;
    if (entity === 'tasks' && user.role === 'staff') {
      const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      if (!existing) throw new HttpError(404, 'Task not found');
      if (existing.assignee_id !== user.id) throw new HttpError(403, 'You can only update tasks assigned to you');
      const body = await readJson(req);
      const allowed = {};
      for (const field of ['status', 'position']) if (Object.hasOwn(body, field)) allowed[field] = body[field];
      const payload = validatePayload(config, allowed, true);
      if (!Object.keys(payload).length) throw new HttpError(400, 'Staff may update task status or position only');
      updateTaskRecord(id, payload, user);
      jsonResponse(res, 200, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
      return;
    }
    requireRole(user, roles);
    const body = await readJson(req);
    const payload = validatePayload(config, body, true);
    if (!Object.keys(payload).length) throw new HttpError(400, 'No supported fields to update');
    const existing = db.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(id);
    if (!existing) throw new HttpError(404, `${activityName(entity)} not found`);
    validateAssociations(entity, payload, existing);
    if (entity === 'tasks') {
      updateTaskRecord(id, payload, user);
      jsonResponse(res, 200, db.prepare('SELECT * FROM tasks WHERE id = ?').get(id));
      return;
    }
    updateRecord(config, payload, id, user, entity);
    const updated = db.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(id);
    if (!updated) throw new HttpError(404, `${activityName(entity)} not found`);
    jsonResponse(res, 200, updated);
    return;
  }
  if (method === 'DELETE' && id) {
    requireRole(user, config.roles.delete);
    const existing = db.prepare(`SELECT * FROM ${config.table} WHERE id = ?`).get(id);
    if (!existing) throw new HttpError(404, `${activityName(entity)} not found`);
    try {
      if (entity === 'tasks') {
        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
          const remaining = db.prepare(`SELECT id FROM tasks
            WHERE project_id = ? AND status = ? ORDER BY position, id`).all(existing.project_id, existing.status);
          const updatePosition = db.prepare('UPDATE tasks SET position = ? WHERE id = ?');
          remaining.forEach((task, index) => updatePosition.run(index, task.id));
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      } else {
        db.prepare(`DELETE FROM ${config.table} WHERE id = ?`).run(id);
      }
    } catch (error) {
      if (String(error.message).includes('FOREIGN KEY constraint failed')) throw new HttpError(409, 'This record is referenced by other data and cannot be deleted');
      throw error;
    }
    recordActivity(user.id, 'delete', activityName(entity), id, `Deleted ${activityName(entity)} ${id}`);
    jsonResponse(res, 200, { message: `${activityName(entity)} deleted` });
    return;
  }
  throw new HttpError(405, 'Method not allowed');
}

function updateRecord(config, payload, id, user, entity) {
  if (entity === 'tasks' && payload.status) {
    payload.completed_at = payload.status === 'completed' ? new Date().toISOString() : null;
  }
  if (['projects', 'profiles', 'tasks', 'contents'].includes(entity)) payload.updated_at = new Date().toISOString();
  const fields = Object.keys(payload);
  const assignments = fields.map((field) => `${field} = ?`).join(', ');
  try {
    const result = db.prepare(`UPDATE ${config.table} SET ${assignments} WHERE id = ?`)
      .run(...fields.map((field) => payload[field]), id);
    if (!result.changes) throw new HttpError(404, `${activityName(entity)} not found`);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (String(error.message).includes('UNIQUE constraint failed')) throw new HttpError(409, 'A record with these values already exists');
    if (String(error.message).includes('FOREIGN KEY constraint failed')) throw new HttpError(400, 'A referenced project, platform, profile, or user does not exist');
    throw error;
  }
  recordActivity(user.id, 'update', activityName(entity), id, `Updated ${activityName(entity)} ${id}`);
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) console.error(error);
    jsonResponse(res, status, { error: status >= 500 ? 'Đã xảy ra lỗi nội bộ.' : localizeError(error.message) });
  });
});

const port = Number.parseInt(process.env.PORT || '4000', 10);
const host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535');

server.listen(port, host, () => {
  console.log(`LINKHUB API listening at http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
