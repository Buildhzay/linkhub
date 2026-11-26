import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { CalendarDays, Check, ChevronDown, CirclePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, PageTitle, Select, Textarea } from '../components/ui';
import type { Platform, Project, RecordData, Task } from '../types';

const columns: Array<{ key: Task['status']; label: string; tone: string }> = [
  { key: 'todo', label: 'Cần thực hiện', tone: 'gray' },
  { key: 'in_progress', label: 'Đang thực hiện', tone: 'blue' },
  { key: 'review', label: 'Chờ duyệt', tone: 'amber' },
  { key: 'completed', label: 'Hoàn thành', tone: 'green' }
];

const categories = [
  ['research', 'Nghiên cứu thông tin'],
  ['copywriting', 'Biên soạn nội dung'],
  ['assets', 'Chuẩn bị tài nguyên'],
  ['profile_setup', 'Thiết lập hồ sơ'],
  ['link_check', 'Kiểm tra liên kết'],
  ['reporting', 'Tổng hợp kết quả']
];

const priorityLabel: Record<string, string> = { low: 'Thấp', medium: 'Vừa', high: 'Cao', urgent: 'Khẩn' };

function TaskForm({
  initial,
  projects,
  platforms,
  currentUserId,
  canEdit,
  busy,
  onSubmit,
  onCancel
}: {
  initial?: Task;
  projects: Project[];
  platforms: Platform[];
  currentUserId: number;
  canEdit: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className="resource-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <label className="form-field"><span>Tên công việc *</span><Input name="title" defaultValue={initial?.title || ''} required /></label>
        <label className="form-field"><span>Dự án *</span><Select name="project_id" defaultValue={String(initial?.project_id || projects[0]?.id || '')} required disabled={!canEdit}>
          {projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </Select></label>
        <label className="form-field"><span>Người phụ trách ID *</span><Input name="assignee_id" type="number" min="1" defaultValue={initial?.assignee_id || currentUserId} required disabled={!canEdit} /><small className="field-hint">Tài khoản demo có thể dùng ID 2 (Manager) hoặc 3 (Staff).</small></label>
        <label className="form-field"><span>Nền tảng</span><Select name="platform_id" defaultValue={initial?.platform_id ? String(initial.platform_id) : ''} disabled={!canEdit}>
          <option value="">Không gắn nền tảng</option>{platforms.map((platform) => <option value={platform.id} key={platform.id}>{platform.name}</option>)}
        </Select></label>
        <label className="form-field"><span>Loại công việc *</span><Select name="category" defaultValue={initial?.category || 'research'} disabled={!canEdit}>
          {categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </Select></label>
        <label className="form-field"><span>Ưu tiên</span><Select name="priority" defaultValue={initial?.priority || 'medium'} disabled={!canEdit}>
          <option value="low">Thấp</option><option value="medium">Vừa</option><option value="high">Cao</option><option value="urgent">Khẩn cấp</option>
        </Select></label>
        <label className="form-field"><span>Thời hạn</span><Input name="due_date" type="date" defaultValue={initial?.due_date || ''} disabled={!canEdit} /></label>
        <label className="form-field"><span>Trạng thái</span><Select name="status" defaultValue={initial?.status || 'todo'}>
          {columns.map((column) => <option value={column.key} key={column.key}>{column.label}</option>)}
        </Select></label>
        <label className="form-field form-field-wide"><span>Mô tả</span><Textarea name="description" rows={3} defaultValue={initial?.description || ''} disabled={!canEdit} /></label>
      </div>
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={onCancel}>Hủy</Button><Button disabled={busy}>{busy ? 'Đang lưu...' : <><Check size={16} />Lưu công việc</>}</Button></div>
    </form>
  );
}

export function KanbanPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [editing, setEditing] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [taskData, projectData, platformData] = await Promise.all([
        api.list<Task>('tasks', { limit: 100, project_id: projectFilter || undefined, sort: 'position', direction: 'asc' }),
        api.list<Project>('projects', { limit: 100 }),
        api.list<Platform>('platforms', { limit: 100 })
      ]);
      setTasks(taskData.data);
      setProjects(projectData.data);
      setPlatforms(platformData.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tải được Kanban');
    } finally {
      setLoading(false);
    }
  }, [projectFilter]);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => Object.fromEntries(columns.map((column) => [
    column.key,
    tasks.filter((task) => task.status === column.key).sort((a, b) => a.position - b.position || a.id - b.id)
  ])) as Record<Task['status'], Task[]>, [tasks]);

  const moveTask = async (task: Task, status: Task['status'], position: number) => {
    if (task.status === status && task.position === position) return;
    setMovingId(task.id);
    try {
      await api.update('tasks', task.id, { status, position });
      await load();
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : 'Không thể cập nhật vị trí công việc', 'error');
    } finally {
      setMovingId(null);
      setDraggedId(null);
    }
  };

  const onDropColumn = (event: DragEvent<HTMLElement>, status: Task['status']) => {
    event.preventDefault();
    if (draggedId === null) return;
    const task = tasks.find((item) => item.id === draggedId);
    if (task) void moveTask(task, status, grouped[status].length);
  };

  const onDropCard = (event: DragEvent<HTMLElement>, target: Task, position: number) => {
    event.preventDefault();
    event.stopPropagation();
    if (draggedId === null || draggedId === target.id) return;
    const task = tasks.find((item) => item.id === draggedId);
    if (task) {
      const adjustedPosition = task.status === target.status && task.position < position
        ? Math.max(0, position - 1)
        : position;
      void moveTask(task, target.status, adjustedPosition);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    const form = new FormData(event.currentTarget);
    const payload: RecordData = {
      title: String(form.get('title') || '').trim(),
      project_id: Number(form.get('project_id')),
      assignee_id: Number(form.get('assignee_id')),
      platform_id: form.get('platform_id') ? Number(form.get('platform_id')) : null,
      category: String(form.get('category') || 'research'),
      priority: String(form.get('priority') || 'medium'),
      due_date: String(form.get('due_date') || '') || null,
      description: String(form.get('description') || '').trim(),
      status: String(form.get('status') || 'todo')
    };
    setBusy(true);
    try {
      if (creating) await api.create('tasks', payload);
      else if (editing) await api.update('tasks', editing.id, payload);
      notify(creating ? 'Đã tạo công việc.' : 'Đã cập nhật công việc.');
      setCreating(false);
      setEditing(null);
      await load();
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : 'Không lưu được công việc', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (task: Task) => {
    if (!window.confirm(`Xóa công việc “${task.title}”?`)) return;
    try {
      await api.remove('tasks', task.id);
      notify('Đã xóa công việc.');
      await load();
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : 'Không xóa được công việc', 'error');
    }
  };

  return (
    <div className="page-stack">
      <PageTitle eyebrow="QUẢN LÝ / CÔNG VIỆC" title="Bảng công việc" description="Kéo thả để cập nhật trạng thái và thứ tự xử lý."
        action={<div className="page-action-group"><Select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Lọc theo dự án"><option value="">Tất cả dự án</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</Select>{canManage && <Button onClick={() => { setEditing(null); setCreating(true); }}><Plus size={17} />Tạo công việc</Button>}</div>} />
      {error && <div className="inline-error">{error}</div>}
      {loading ? <Loading /> : (
        <div className="kanban-board">
          {columns.map((column) => (
            <section className={`kanban-column kanban-${column.tone}`} key={column.key} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDropColumn(event, column.key)}>
              <header className="kanban-column-header">
                <span className={`kanban-column-dot dot-${column.tone}`} />
                <h2>{column.label}</h2><span className="kanban-count">{grouped[column.key].length}</span>
                {canManage && <button className="icon-button kanban-add" aria-label={`Thêm công việc ${column.label}`} onClick={() => { setEditing(null); setCreating(true); }}><CirclePlus size={17} /></button>}
              </header>
              <div className="kanban-cards">
                {grouped[column.key].map((task, index) => {
                  const project = projects.find((item) => item.id === task.project_id);
                  const platform = platforms.find((item) => item.id === task.platform_id);
                  return (
                    <article
                      className={`kanban-task ${movingId === task.id ? 'kanban-task-moving' : ''}`}
                      key={task.id}
                      draggable={movingId !== task.id}
                      onDragStart={() => setDraggedId(task.id)}
                      onDragEnd={() => setDraggedId(null)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => onDropCard(event, task, index)}
                    >
                      <div className="kanban-task-top"><Badge tone={task.priority === 'urgent' || task.priority === 'high' ? 'amber' : 'neutral'}>{priorityLabel[task.priority] || task.priority}</Badge>
                        {canManage && <div className="task-card-actions"><button className="icon-button" title="Chỉnh sửa" onClick={() => { setEditing(task); setCreating(false); }}><Pencil size={14} /></button><button className="icon-button row-action-danger" title="Xóa" onClick={() => void remove(task)}><Trash2 size={14} /></button></div>}
                      </div>
                      <h3>{task.title}</h3>
                      {task.description && <p className="kanban-task-description">{task.description}</p>}
                      <div className="kanban-task-meta"><span>{project?.name || `Dự án #${task.project_id}`}</span>{platform && <span>{platform.name}</span>}</div>
                      <div className="kanban-task-footer">
                        <span className="task-assignee-avatar" title={`Người phụ trách #${task.assignee_id}`}>#{task.assignee_id}</span>
                        <span className="task-category">{categories.find(([key]) => key === task.category)?.[1] || task.category}</span>
                        {task.due_date && <time className="task-due"><CalendarDays size={13} />{new Date(task.due_date).toLocaleDateString('vi-VN')}</time>}
                      </div>
                      {!canManage && <label className="mobile-status-change"><span>Trạng thái</span><Select value={task.status} onChange={(event) => void moveTask(task, event.target.value as Task['status'], grouped[event.target.value as Task['status']].length)}>
                        {columns.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                      </Select><ChevronDown size={14} /></label>}
                    </article>
                  );
                })}
                {!grouped[column.key].length && <div className="kanban-empty">Thả công việc vào đây</div>}
              </div>
            </section>
          ))}
        </div>
      )}
      {!loading && !tasks.length && <Card><EmptyState title="Chưa có công việc" description={user?.role === 'staff' ? 'Hiện chưa có công việc nào được giao cho bạn.' : 'Tạo công việc đầu tiên để bắt đầu bảng Kanban.'} /></Card>}
      {(creating || editing) && <Modal title={creating ? 'Tạo công việc' : 'Cập nhật công việc'} onClose={() => { setCreating(false); setEditing(null); }} wide>
        <TaskForm initial={editing || undefined} projects={projects} platforms={platforms} currentUserId={user?.id || 1} canEdit={canManage} busy={busy} onSubmit={submit} onCancel={() => { setCreating(false); setEditing(null); }} />
      </Modal>}
    </div>
  );
}
