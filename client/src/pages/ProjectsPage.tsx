import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, BriefcaseBusiness, ExternalLink, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, PageTitle, Pagination, Select, Textarea } from '../components/ui';
import { ResourcePage } from './ResourcePage';
import type { PageResult, Project, RecordData, Task } from '../types';

interface ProjectFormValue extends RecordData {
  name: string;
  description: string;
  industry: string;
  website_url: string;
  main_keywords: string;
  secondary_keywords: string;
  introduction: string;
  logo_url: string;
  status: string;
}

const blankProject: ProjectFormValue = {
  name: '', description: '', industry: '', website_url: '', main_keywords: '',
  secondary_keywords: '', introduction: '', logo_url: '', status: 'active'
};

const projectStatus: Record<string, string> = {
  planning: 'Lên kế hoạch',
  active: 'Đang hoạt động',
  paused: 'Tạm dừng',
  completed: 'Hoàn thành'
};

function projectTone(status: string) {
  return status === 'active' || status === 'completed' ? 'green' : status === 'planning' ? 'amber' : 'neutral';
}

function ProjectForm({
  initial,
  busy,
  onSubmit,
  onCancel
}: {
  initial: ProjectFormValue;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className="resource-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <label className="form-field"><span>Tên dự án *</span><Input name="name" defaultValue={initial.name} required /></label>
        <label className="form-field"><span>Website chính *</span><Input name="website_url" type="url" defaultValue={initial.website_url} placeholder="https://example.com" required /></label>
        <label className="form-field"><span>Lĩnh vực</span><Input name="industry" defaultValue={initial.industry} placeholder="Ví dụ: Phần mềm, bán lẻ..." /></label>
        <label className="form-field"><span>Trạng thái</span><Select name="status" defaultValue={initial.status}>
          <option value="planning">Lên kế hoạch</option><option value="active">Đang hoạt động</option><option value="paused">Tạm dừng</option><option value="completed">Hoàn thành</option>
        </Select></label>
        <label className="form-field"><span>Từ khóa chính</span><Input name="main_keywords" defaultValue={initial.main_keywords} /></label>
        <label className="form-field"><span>Từ khóa phụ</span><Input name="secondary_keywords" defaultValue={initial.secondary_keywords} placeholder="Phân cách bằng dấu phẩy" /></label>
        <label className="form-field"><span>URL logo</span><Input name="logo_url" type="url" defaultValue={initial.logo_url} /></label>
        <label className="form-field form-field-wide"><span>Mô tả dự án</span><Textarea name="description" rows={3} defaultValue={initial.description} /></label>
        <label className="form-field form-field-wide"><span>Giới thiệu</span><Textarea name="introduction" rows={3} defaultValue={initial.introduction} /></label>
      </div>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onCancel}>Hủy</Button><Button disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu dự án'}</Button></div>
    </form>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [result, setResult] = useState<PageResult<Project> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api.list<Project>('projects', { page, limit: 12, q: search || undefined, sort: 'updated_at', direction: 'desc' }));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tải được dự án', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, page, search]);

  useEffect(() => { void load(); }, [load]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: ProjectFormValue = {
      name: String(form.get('name') || '').trim(),
      website_url: String(form.get('website_url') || '').trim(),
      industry: String(form.get('industry') || '').trim(),
      status: String(form.get('status') || 'active'),
      main_keywords: String(form.get('main_keywords') || '').trim(),
      secondary_keywords: String(form.get('secondary_keywords') || '').trim(),
      logo_url: String(form.get('logo_url') || '').trim(),
      description: String(form.get('description') || '').trim(),
      introduction: String(form.get('introduction') || '').trim()
    };
    setBusy(true);
    try {
      if (creating) await api.create('projects', payload);
      else if (editing) await api.update('projects', editing.id, payload);
      notify(creating ? 'Đã tạo dự án.' : 'Đã cập nhật dự án.');
      setEditing(null);
      setCreating(false);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không lưu được dự án', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (project: Project) => {
    if (!window.confirm(`Xóa dự án “${project.name}” và dữ liệu liên quan? Thao tác không thể hoàn tác.`)) return;
    try {
      await api.remove('projects', project.id);
      notify('Đã xóa dự án.');
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không xóa được dự án', 'error');
    }
  };

  const openNew = () => {
    setEditing(null);
    setCreating(true);
  };

  return (
    <div className="page-stack">
      <PageTitle eyebrow="QUẢN LÝ / DỰ ÁN" title="Dự án" description="Quản lý website, lĩnh vực và mục tiêu hiện diện số của từng dự án."
        action={<div className="page-action-group"><label className="project-search"><Search size={16} /><input placeholder="Tìm dự án..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>{canManage && <Button onClick={openNew}><Plus size={17} />Tạo dự án</Button>}</div>} />
      {loading ? <Loading /> : !result?.data.length ? (
        <Card><EmptyState title="Chưa có dự án" description="Tạo dự án đầu tiên để bắt đầu quản lý quy trình." action={canManage ? <Button onClick={openNew}><Plus size={16} />Tạo dự án</Button> : undefined} /></Card>
      ) : (
        <>
          <div className="project-grid">
            {result.data.map((project) => (
              <Card className="project-card" key={project.id}>
                <div className="project-card-top">
                  <div className="project-logo">{project.logo_url ? <img src={project.logo_url} alt="" /> : <BriefcaseBusiness size={20} />}</div>
                  <Badge tone={projectTone(project.status)}>{projectStatus[project.status] || project.status}</Badge>
                  {canManage && <div className="project-card-actions">
                    <button className="icon-button row-action" title="Chỉnh sửa" onClick={() => { setEditing(project); setCreating(false); }}><Pencil size={15} /></button>
                    <button className="icon-button row-action row-action-danger" title="Xóa" onClick={() => void remove(project)}><Trash2 size={15} /></button>
                  </div>}
                </div>
                <h2>{project.name}</h2>
                <p className="project-industry">{project.industry || 'Chưa phân loại'}</p>
                <p className="project-description">{project.description || project.introduction || 'Chưa có mô tả cho dự án này.'}</p>
                <div className="project-url"><ExternalLink size={14} /><a href={project.website_url} target="_blank" rel="noreferrer">{project.website_url}</a></div>
                <div className="project-keywords">
                  {[project.main_keywords, ...project.secondary_keywords.split(',').map((value) => value.trim())].filter(Boolean).slice(0, 4).map((keyword) => <span key={keyword}>{keyword}</span>)}
                </div>
                <div className="project-card-footer">
                  <span>Cập nhật {new Date(project.updated_at).toLocaleDateString('vi-VN')}</span>
                  <button type="button" className="project-open" onClick={() => navigate(`/projects/${project.id}`)}>Mở dự án <ArrowUpRight size={15} /></button>
                </div>
              </Card>
            ))}
          </div>
          <Card className="project-pagination"><span>{result.pagination.total} dự án</span><Pagination page={result.pagination.page} pages={result.pagination.pages} onChange={setPage} /></Card>
        </>
      )}
      {(creating || editing) && <Modal title={creating ? 'Tạo dự án mới' : 'Chỉnh sửa dự án'} onClose={() => { setCreating(false); setEditing(null); }} wide>
        <ProjectForm initial={editing ? {
          name: editing.name, description: editing.description, industry: editing.industry,
          website_url: editing.website_url, main_keywords: editing.main_keywords,
          secondary_keywords: editing.secondary_keywords, introduction: editing.introduction,
          logo_url: editing.logo_url, status: editing.status
        } : blankProject} busy={busy} onSubmit={onSubmit} onCancel={() => { setCreating(false); setEditing(null); }} />
      </Modal>}
    </div>
  );
}

type ProjectTab = 'overview' | 'profiles' | 'links' | 'tasks' | 'contents';
const tabs: Array<{ key: ProjectTab; label: string }> = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'profiles', label: 'Hồ sơ' },
  { key: 'links', label: 'Liên kết' },
  { key: 'tasks', label: 'Công việc' },
  { key: 'contents', label: 'Nội dung' }
];

export function ProjectDetailPage() {
  const { id } = useParams();
  const projectId = Number(id);
  const [project, setProject] = useState<Project | null>(null);
  const [counts, setCounts] = useState({ profiles: 0, links: 0, tasks: 0, contents: 0 });
  const [tab, setTab] = useState<ProjectTab>('overview');
  const [loading, setLoading] = useState(true);
  const { notify } = useToast();

  useEffect(() => {
    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([
      api.get<Project>('projects', projectId),
      api.list('profiles', { project_id: projectId, limit: 1 }),
      api.list('links', { project_id: projectId, limit: 1 }),
      api.list<Task>('tasks', { project_id: projectId, limit: 100 }),
      api.list('contents', { project_id: projectId, limit: 1 })
    ]).then(([projectData, profiles, links, tasks, contents]) => {
      if (!active) return;
      setProject(projectData);
      setCounts({
        profiles: profiles.pagination.total,
        links: links.pagination.total,
        tasks: tasks.pagination.total,
        contents: contents.pagination.total
      });
    }).catch((error: unknown) => {
      if (active) notify(error instanceof Error ? error.message : 'Không tải được dự án', 'error');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [notify, projectId]);

  if (loading) return <Loading />;
  if (!project) return <div className="page-error">Không tìm thấy dự án này.</div>;

  return (
    <div className="page-stack">
      <div className="back-link-row"><Link to="/projects">← Quay lại danh sách dự án</Link></div>
      <PageTitle eyebrow={`DỰ ÁN / #${project.id}`} title={project.name} description={project.industry || 'Chi tiết và tiến độ triển khai dự án'} action={<a className="button button-secondary" href={project.website_url} target="_blank" rel="noreferrer">Website chính <ExternalLink size={15} /></a>} />
      <Card className="project-detail-card">
        <div className="project-detail-banner"><div className="project-detail-avatar">{project.logo_url ? <img src={project.logo_url} alt="" /> : <BriefcaseBusiness size={22} />}</div><div><Badge tone={projectTone(project.status)}>{projectStatus[project.status] || project.status}</Badge><p>{project.description || project.introduction || 'Chưa có mô tả.'}</p></div></div>
        <nav className="project-tabs">
          {tabs.map((item) => <button key={item.key} className={tab === item.key ? 'project-tab project-tab-active' : 'project-tab'} onClick={() => setTab(item.key)}>{item.label}<span>{item.key === 'overview' ? '' : counts[item.key]}</span></button>)}
        </nav>
      </Card>
      {tab === 'overview' && <ProjectOverview project={project} counts={counts} />}
      {tab === 'profiles' && <ResourcePage kind="profiles" projectId={project.id} />}
      {tab === 'links' && <ResourcePage kind="links" projectId={project.id} />}
      {tab === 'contents' && <ResourcePage kind="contents" projectId={project.id} />}
      {tab === 'tasks' && <ProjectTaskList projectId={project.id} />}
    </div>
  );
}

function ProjectOverview({ project, counts }: { project: Project; counts: { profiles: number; links: number; tasks: number; contents: number } }) {
  const overviewItems = [
    { label: 'Hồ sơ nền tảng', value: counts.profiles, icon: '01' },
    { label: 'Liên kết ghi nhận', value: counts.links, icon: '02' },
    { label: 'Công việc', value: counts.tasks, icon: '03' },
    { label: 'Nội dung', value: counts.contents, icon: '04' }
  ];
  return (
    <div className="page-stack">
      <div className="project-detail-stats">{overviewItems.map((item) => <Card className="project-detail-stat" key={item.label}><span>{item.icon}</span><div><strong>{item.value}</strong><small>{item.label}</small></div></Card>)}</div>
      <div className="project-overview-grid">
        <Card className="project-info-card"><div className="card-heading"><div><h2>Thông tin dự án</h2><p>Thông tin chính của website</p></div></div><dl className="detail-list">
          <div><dt>Website chính</dt><dd><a href={project.website_url} target="_blank" rel="noreferrer">{project.website_url}</a></dd></div>
          <div><dt>Lĩnh vực</dt><dd>{project.industry || '—'}</dd></div>
          <div><dt>Từ khóa chính</dt><dd>{project.main_keywords || '—'}</dd></div>
          <div><dt>Từ khóa phụ</dt><dd>{project.secondary_keywords || '—'}</dd></div>
          <div><dt>Cập nhật gần nhất</dt><dd>{new Date(project.updated_at).toLocaleString('vi-VN')}</dd></div>
        </dl></Card>
        <Card className="project-info-card"><div className="card-heading"><div><h2>Giới thiệu</h2><p>Nội dung dự án</p></div></div><p className="project-introduction">{project.introduction || project.description || 'Chưa có phần giới thiệu.'}</p></Card>
      </div>
    </div>
  );
}

function ProjectTaskList({ projectId }: { projectId: number }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    api.list<Task>('tasks', { project_id: projectId, limit: 100 })
      .then((result) => setTasks(result.data))
      .catch((requestError: unknown) => setError(requestError instanceof Error ? requestError.message : 'Không tải được công việc'))
      .finally(() => setLoading(false));
  }, [projectId]);
  if (loading) return <Loading />;
  return (
    <Card className="table-card">
      <div className="card-heading"><div><h2>Công việc của dự án</h2><p>Để thay đổi thứ tự hoặc trạng thái, dùng bảng Kanban.</p></div><Link to="/tasks" className="button button-secondary">Mở Kanban</Link></div>
      {error && <div className="inline-error">{error}</div>}
      {!tasks.length ? <EmptyState title="Chưa có công việc" /> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Công việc</th><th>Loại</th><th>Thời hạn</th><th>Ưu tiên</th><th>Trạng thái</th></tr></thead><tbody>
        {tasks.map((task) => <tr key={task.id}><td className="table-primary">{task.title}</td><td>{task.category}</td><td>{task.due_date || '—'}</td><td>{task.priority}</td><td><Badge tone={task.status === 'completed' ? 'green' : task.status === 'in_progress' ? 'blue' : 'neutral'}>{task.status}</Badge></td></tr>)}
      </tbody></table></div>}
    </Card>
  );
}
