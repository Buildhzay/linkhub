import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';

const here = dirname(fileURLToPath(import.meta.url));

export function getDatabasePath() {
  const configured = process.env.DATABASE_PATH || './data/linkhub.sqlite';
  return resolve(process.cwd(), configured);
}

export function openDatabase(path = getDatabasePath()) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));
  return db;
}

const platforms = [
  ['Medium', 'https://medium.example', 'Xuất bản', 'Nền tảng xuất bản bài viết chuyên sâu.', 'contextual,profile', 'high'],
  ['Pinterest', 'https://pinterest.example', 'Hình ảnh', 'Chia sẻ ý tưởng và bộ sưu tập hình ảnh.', 'profile,contextual', 'medium'],
  ['Reddit', 'https://reddit.example', 'Cộng đồng', 'Diễn đàn cộng đồng; cần tuân thủ quy định từng nhóm.', 'contextual', 'medium'],
  ['GitHub', 'https://github.example', 'Phát triển', 'Lưu trữ mã nguồn và tài liệu dự án.', 'profile,contextual', 'high'],
  ['Blogger', 'https://blogger.example', 'Xuất bản', 'Nền tảng viết blog và chia sẻ bài viết.', 'contextual,profile', 'medium'],
  ['WordPress', 'https://wordpress.example', 'Xuất bản', 'Nền tảng quản lý nội dung và website.', 'contextual,profile', 'high'],
  ['LinkedIn', 'https://linkedin.example', 'Chuyên nghiệp', 'Kênh giới thiệu doanh nghiệp và kết nối chuyên môn.', 'profile,contextual', 'high'],
  ['Facebook', 'https://facebook.example', 'Mạng xã hội', 'Trang thông tin và cập nhật dành cho cộng đồng.', 'profile,contextual', 'medium'],
  ['Instagram', 'https://instagram.example', 'Mạng xã hội', 'Kênh hình ảnh và câu chuyện thương hiệu.', 'profile', 'medium'],
  ['Danh bạ doanh nghiệp A', 'https://directory-a.example', 'Danh bạ', 'Danh bạ địa điểm mẫu phục vụ trình diễn.', 'profile', 'low'],
  ['Danh bạ doanh nghiệp B', 'https://directory-b.example', 'Danh bạ', 'Trang giới thiệu doanh nghiệp mẫu.', 'profile', 'low'],
  ['Dev.to', 'https://devto.example', 'Phát triển', 'Cộng đồng chia sẻ kiến thức lập trình.', 'contextual,profile', 'medium']
];

const projectNames = [
  ['Cà phê Hưng Phát', 'Thực phẩm và đồ uống', 'https://hungphat.example', 'cà phê rang xay, cà phê nguyên chất'],
  ['Mộc An', 'Bán lẻ và đồ gia dụng', 'https://mocan.example', 'đồ gia dụng bền vững, sản phẩm thủ công'],
  ['VietNote', 'Phần mềm năng suất', 'https://vietnote.example', 'ứng dụng ghi chú, quản lý công việc nhóm']
];

function insertIfEmpty(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count > 0) return;

  const users = [
    ['admin', 'Quản trị viên Demo', 'admin@linkhub.demo', 'Admin@123', 'admin'],
    ['manager', 'Quản lý Demo', 'manager@linkhub.demo', 'Manager@123', 'manager'],
    ['staff', 'Nhân viên Demo', 'staff@linkhub.demo', 'Staff@123', 'staff']
  ];
  const addUser = db.prepare('INSERT INTO users (username, full_name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)');
  for (const [username, name, email, password, role] of users) {
    addUser.run(username, name, email, hashPassword(password), role);
  }

  const addPlatform = db.prepare('INSERT INTO platforms (name, url, category, description, link_types, priority) VALUES (?, ?, ?, ?, ?, ?)');
  for (const platform of platforms) addPlatform.run(...platform);

  const addProject = db.prepare(`INSERT INTO projects
    (name, industry, website_url, main_keywords, secondary_keywords, introduction, owner_id)
    VALUES (?, ?, ?, ?, ?, ?, 2)`);
  for (const [name, industry, website, keywords] of projectNames) {
    addProject.run(name, industry, website, keywords.split(', ')[0], keywords, `Thông tin giới thiệu mẫu cho dự án ${name}.`);
  }

  const profileStatus = [
    ['completed', 'completed', 'completed', 'completed', 'in_progress', 'rejected'],
    ['completed', 'completed', 'completed', 'completed', 'pending_review', 'not_started'],
    ['completed', 'completed', 'completed', 'completed', 'needs_update', 'not_started']
  ];
  const addProfile = db.prepare(`INSERT INTO profiles
    (project_id, platform_id, name, profile_url, brand_name, description, verification_status, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let projectId = 1; projectId <= 3; projectId++) {
    for (let platformId = 1; platformId <= 6; platformId++) {
      const status = profileStatus[projectId - 1][platformId - 1];
      const profileIndex = (projectId - 1) * 6 + platformId - 1;
      const ageDays = 58 - Math.round(profileIndex * 41 / 17);
      const createdAt = new Date(Date.now() - ageDays * 86400000).toISOString();
      addProfile.run(
        projectId, platformId, `${projectNames[projectId - 1][0]} — ${platforms[platformId - 1][0]}`,
        status === 'not_started' ? '' : `https://profiles.example/${projectId}/${platformId}`, projectNames[projectId - 1][0],
        'Hồ sơ mẫu dùng cho trình diễn; không tạo tài khoản thật trên nền tảng.',
        status === 'completed' ? 'verified' : (status === 'rejected' ? 'rejected' : 'unverified'),
        status, createdAt, createdAt
      );
    }
  }

  const linkStatuses = [
    'active', 'active', 'unverified', 'active', 'unreachable', 'active',
    'unverified', 'active', 'active', 'recheck', 'active', 'unverified',
    'active', 'active', 'unreachable', 'active', 'unverified', 'active',
    'removed', 'active', 'active', 'unverified', 'recheck', 'active'
  ];
  const addLink = db.prepare(`INSERT INTO links
    (project_id, platform_id, profile_id, source_url, target_url, link_type, anchor_text, status, check_note, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 24; i++) {
    const projectId = (Math.floor(i / 4) % 3) + 1;
    const platformId = (i % 4) + 1;
    const profileId = ((projectId - 1) * 6) + platformId;
    const profileCreatedAt = new Date(Date.now() -
      (58 - Math.round((profileId - 1) * 41 / 17)) * 86400000);
    const recordedAt = new Date(Math.min(
      Date.now(),
      profileCreatedAt.getTime() + (3 + (i % 7) * 3) * 86400000
    )).toISOString();
    const platformSlug = platforms[platformId - 1][0].normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    addLink.run(
      projectId, platformId, profileId, `https://${platformSlug}.mentions.example/project-${projectId}/bai-viet-${i + 1}`,
      projectNames[projectId - 1][2], i % 2 ? 'contextual' : 'profile',
      projectNames[projectId - 1][0], linkStatuses[i % linkStatuses.length],
      'Dữ liệu mẫu; trạng thái liên kết chưa được xác minh trên Internet.', recordedAt
    );
  }

  const taskStatuses = ['todo', 'in_progress', 'review', 'completed'];
  const categories = ['research', 'copywriting', 'assets', 'profile_setup', 'link_check', 'reporting'];
  const taskTitles = [
    'Khảo sát nhóm từ khóa địa phương',
    'Biên soạn giới thiệu thương hiệu',
    'Chuẩn bị ảnh bìa hồ sơ',
    'Hoàn thiện hồ sơ nền tảng',
    'Rà soát liên kết đến website',
    'Tổng hợp kết quả tuần',
    'Lập danh sách chủ đề nội dung',
    'Biên tập bài giới thiệu sản phẩm',
    'Chuẩn hóa thông tin doanh nghiệp',
    'Kiểm tra mô tả trang thương hiệu',
    'Đối chiếu URL nguồn và đích',
    'Cập nhật tiến độ triển khai',
    'Nghiên cứu cộng đồng phù hợp',
    'Soạn nội dung hướng dẫn sử dụng',
    'Thiết kế hình ảnh minh họa',
    'Kiểm tra thông tin hồ sơ',
    'Ghi nhận trạng thái liên kết',
    'Chuẩn bị báo cáo tháng'
  ];
  const addTask = db.prepare(`INSERT INTO tasks
    (project_id, platform_id, assignee_id, title, description, category, due_date, priority, status, position, completed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 18; i++) {
    const status = taskStatuses[i % taskStatuses.length];
    const createdAt = new Date(Date.now() - (56 - i * 2) * 86400000);
    const completedAt = status === 'completed'
      ? new Date(createdAt.getTime() + 3 * 86400000).toISOString()
      : null;
    addTask.run(
      (i % 3) + 1, (i % 12) + 1, (i % 2) + 2, taskTitles[i],
      'Công việc mẫu minh họa quy trình triển khai và theo dõi dự án.',
      categories[i % categories.length],
      new Date(Date.now() + (i - 5) * 86400000).toISOString().slice(0, 10),
      ['low', 'medium', 'high'][i % 3], status, Math.floor(i / 4),
      completedAt, createdAt.toISOString(), completedAt || createdAt.toISOString()
    );
  }

  const addContent = db.prepare(`INSERT INTO contents
    (project_id, platform_id, created_by, title, description, keywords, target_url, status, is_used)
    VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?)`);
  for (let i = 0; i < 10; i++) {
    const projectId = (i % 3) + 1;
    addContent.run(
      projectId, (i % 12) + 1, `Nội dung mẫu ${i + 1}`, 'Bản nháp được chuẩn bị để giới thiệu sản phẩm tới đúng nhóm khách hàng.',
      projectNames[projectId - 1][3], projectNames[projectId - 1][2],
      ['draft', 'review', 'ready', 'published'][i % 4], i % 4 === 3 ? 1 : 0
    );
  }

  const addLog = db.prepare(`INSERT INTO activity_logs (user_id, action, entity_type, entity_id, message)
    VALUES (2, 'seed', 'system', ?, ?)`);
  const logMessages = [
    'Khởi tạo dữ liệu trình diễn.',
    'Cập nhật thông tin dự án.',
    'Hoàn thiện hồ sơ nền tảng.',
    'Ghi nhận liên kết cần theo dõi.',
    'Cập nhật trạng thái công việc.',
    'Chuẩn bị nội dung giới thiệu.',
    'Rà soát tiến độ triển khai.',
    'Tổng hợp hoạt động gần đây.'
  ];
  for (let i = 0; i < logMessages.length; i++) addLog.run(i + 1, logMessages[i]);
}

export function seedDatabase(db) {
  db.exec('BEGIN IMMEDIATE');
  try {
    insertIfEmpty(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = openDatabase();
  seedDatabase(db);
  const counts = Object.fromEntries(
    ['users', 'projects', 'platforms', 'profiles', 'links', 'tasks', 'contents', 'activity_logs']
      .map((table) => [table, db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count])
  );
  console.log(JSON.stringify({ database: getDatabasePath(), counts }, null, 2));
  db.close();
}
