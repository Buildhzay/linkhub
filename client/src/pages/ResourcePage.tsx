import { useCallback, useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Activity, Check, ExternalLink, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, PageTitle, Pagination, SearchBox, Select, Textarea } from '../components/ui';
import type { PageResult, RecordData } from '../types';

type ResourceKind = 'platforms' | 'profiles' | 'links' | 'contents';
type ValueType = 'text' | 'url' | 'number' | 'textarea' | 'select' | 'checkbox' | 'date';
interface FieldOption { value: string; label: string }
interface FieldConfig {
  name: string;
  label: string;
  type?: ValueType;
  required?: boolean;
  nullable?: boolean;
  options?: FieldOption[];
  placeholder?: string;
  hint?: string;
}
interface Row extends Record<string, unknown> { id: number }
interface ResourceConfig {
  title: string;
  description: string;
  noun: string;
  endpoint: string;
  fields: FieldConfig[];
  columns: Array<{ name: string; label: string; render?: (row: Row, lookup: Lookup) => ReactNode }>;
  canManage: (role: string) => boolean;
}
interface Lookup {
  projects: Array<{ id: number; name: string }>;
  platforms: Array<{ id: number; name: string }>;
  profiles: Array<{ id: number; name: string }>;
}

const profileStatuses: FieldOption[] = [
  { value: 'not_started', label: 'Chưa triển khai' },
  { value: 'in_progress', label: 'Đang thực hiện' },
  { value: 'pending_review', label: 'Chờ kiểm duyệt' },
  { value: 'completed', label: 'Đã hoàn thành' },
  { value: 'rejected', label: 'Bị từ chối' },
  { value: 'needs_update', label: 'Cần cập nhật' }
];
const linkStatuses: FieldOption[] = [
  { value: 'active', label: 'Đang hoạt động' },
  { value: 'unverified', label: 'Chưa xác minh' },
  { value: 'unreachable', label: 'Không truy cập được' },
  { value: 'removed', label: 'Đã bị xóa' },
  { value: 'recheck', label: 'Cần kiểm tra lại' }
];
const contentStatuses: FieldOption[] = [
  { value: 'draft', label: 'Bản nháp' },
  { value: 'review', label: 'Chờ duyệt' },
  { value: 'ready', label: 'Sẵn sàng' },
  { value: 'published', label: 'Đã sử dụng' },
  { value: 'archived', label: 'Lưu trữ' }
];

const configs: Record<ResourceKind, ResourceConfig> = {
  platforms: {
    title: 'Kho nền tảng',
    description: 'Quản lý các nền tảng và danh mục triển khai hợp lệ.',
    noun: 'nền tảng',
    endpoint: 'platforms',
    canManage: (role) => role === 'admin' || role === 'manager',
    fields: [
      { name: 'name', label: 'Tên nền tảng', required: true },
      { name: 'url', label: 'Địa chỉ website', type: 'url', required: true },
      { name: 'category', label: 'Danh mục', required: true, placeholder: 'Publishing, Social...' },
      { name: 'description', label: 'Mô tả', type: 'textarea' },
      { name: 'link_types', label: 'Loại liên kết', placeholder: 'profile, contextual' },
      { name: 'priority', label: 'Mức ưu tiên', type: 'select', options: [
        { value: 'low', label: 'Thấp' }, { value: 'medium', label: 'Trung bình' }, { value: 'high', label: 'Cao' }
      ] },
      { name: 'status', label: 'Trạng thái', type: 'select', options: [
        { value: 'active', label: 'Đang hoạt động' }, { value: 'inactive', label: 'Tạm dừng' }, { value: 'research', label: 'Đang nghiên cứu' }
      ] },
      { name: 'notes', label: 'Ghi chú', type: 'textarea' }
    ],
    columns: [
      { name: 'name', label: 'Nền tảng' },
      { name: 'category', label: 'Danh mục' },
      { name: 'link_types', label: 'Loại liên kết' },
      { name: 'priority', label: 'Ưu tiên' },
      { name: 'status', label: 'Trạng thái' },
      { name: 'url', label: 'Website', render: (row) => <a className="table-link" href={String(row.url)} target="_blank" rel="noreferrer">Mở <ExternalLink size={13} /></a> }
    ]
  },
  profiles: {
    title: 'Hồ sơ nền tảng',
    description: 'Theo dõi hồ sơ theo dự án, trạng thái hoàn thiện và xác minh.',
    noun: 'hồ sơ',
    endpoint: 'profiles',
    canManage: () => true,
    fields: [
      { name: 'project_id', label: 'Dự án', type: 'select', required: true },
      { name: 'platform_id', label: 'Nền tảng', type: 'select', required: true },
      { name: 'name', label: 'Tên hồ sơ', required: true },
      { name: 'profile_url', label: 'URL hồ sơ', type: 'url' },
      { name: 'brand_name', label: 'Tên thương hiệu' },
      { name: 'description', label: 'Mô tả', type: 'textarea' },
      { name: 'avatar_url', label: 'URL ảnh đại diện', type: 'url' },
      { name: 'verification_status', label: 'Xác minh', type: 'select', options: [
        { value: 'unverified', label: 'Chưa xác minh' }, { value: 'verified', label: 'Đã xác minh' }, { value: 'rejected', label: 'Bị từ chối' }
      ] },
      { name: 'status', label: 'Trạng thái', type: 'select', options: profileStatuses }
    ],
    columns: [
      { name: 'name', label: 'Hồ sơ' },
      { name: 'project_id', label: 'Dự án', render: (row, lookup) => lookup.projects.find((item) => item.id === Number(row.project_id))?.name || `#${row.project_id}` },
      { name: 'platform_id', label: 'Nền tảng', render: (row, lookup) => lookup.platforms.find((item) => item.id === Number(row.platform_id))?.name || `#${row.platform_id}` },
      { name: 'status', label: 'Hoàn thiện' },
      { name: 'verification_status', label: 'Xác minh' },
      { name: 'profile_url', label: 'Liên kết', render: (row) => row.profile_url ? <a className="table-link" href={String(row.profile_url)} target="_blank" rel="noreferrer">Mở <ExternalLink size={13} /></a> : '—' }
    ]
  },
  links: {
    title: 'Quản lý liên kết',
    description: 'Ghi nhận và theo dõi các liên kết theo dự án và nền tảng.',
    noun: 'liên kết',
    endpoint: 'links',
    canManage: () => true,
    fields: [
      { name: 'project_id', label: 'Dự án', type: 'select', required: true },
      { name: 'platform_id', label: 'Nền tảng', type: 'select', required: true },
      { name: 'profile_id', label: 'Hồ sơ (không bắt buộc)', type: 'select', nullable: true },
      { name: 'source_url', label: 'URL nguồn', type: 'url', required: true },
      { name: 'target_url', label: 'URL đích', type: 'url', required: true },
      { name: 'link_type', label: 'Loại liên kết', placeholder: 'profile, contextual...' },
      { name: 'anchor_text', label: 'Anchor text' },
      { name: 'status', label: 'Trạng thái', type: 'select', options: linkStatuses },
      { name: 'notes', label: 'Ghi chú', type: 'textarea' }
    ],
    columns: [
      { name: 'source_url', label: 'URL nguồn', render: (row) => <a className="table-link truncate-link" href={String(row.source_url)} target="_blank" rel="noreferrer">{String(row.source_url)} <ExternalLink size={13} /></a> },
      { name: 'target_url', label: 'URL đích', render: (row) => <a className="table-link truncate-link" href={String(row.target_url)} target="_blank" rel="noreferrer">{String(row.target_url)} <ExternalLink size={13} /></a> },
      { name: 'platform_id', label: 'Nền tảng', render: (row, lookup) => lookup.platforms.find((item) => item.id === Number(row.platform_id))?.name || `#${row.platform_id}` },
      { name: 'anchor_text', label: 'Anchor text' },
      { name: 'status', label: 'Trạng thái' },
      { name: 'recorded_at', label: 'Ngày ghi nhận', render: (row) => formatDate(row.recorded_at) }
    ]
  },
  contents: {
    title: 'Thư viện nội dung',
    description: 'Lưu trữ nội dung đã chuẩn bị và theo dõi trạng thái sử dụng.',
    noun: 'nội dung',
    endpoint: 'contents',
    canManage: () => true,
    fields: [
      { name: 'project_id', label: 'Dự án', type: 'select', required: true },
      { name: 'platform_id', label: 'Nền tảng (không bắt buộc)', type: 'select', nullable: true },
      { name: 'title', label: 'Tiêu đề', required: true },
      { name: 'description', label: 'Mô tả', type: 'textarea' },
      { name: 'keywords', label: 'Từ khóa', placeholder: 'Từ khóa, phân cách bằng dấu phẩy' },
      { name: 'target_url', label: 'URL đích', type: 'url', required: true },
      { name: 'status', label: 'Trạng thái', type: 'select', options: contentStatuses },
      { name: 'is_used', label: 'Đã sử dụng', type: 'checkbox' }
    ],
    columns: [
      { name: 'title', label: 'Nội dung' },
      { name: 'project_id', label: 'Dự án', render: (row, lookup) => lookup.projects.find((item) => item.id === Number(row.project_id))?.name || `#${row.project_id}` },
      { name: 'platform_id', label: 'Nền tảng', render: (row, lookup) => row.platform_id ? lookup.platforms.find((item) => item.id === Number(row.platform_id))?.name || `#${row.platform_id}` : '—' },
      { name: 'status', label: 'Trạng thái' },
      { name: 'is_used', label: 'Đã dùng', render: (row) => row.is_used ? 'Có' : 'Chưa' },
      { name: 'target_url', label: 'URL đích', render: (row) => <a className="table-link" href={String(row.target_url)} target="_blank" rel="noreferrer">Mở <ExternalLink size={13} /></a> }
    ]
  }
};

function formatDate(value: unknown): string {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('vi-VN');
}

const statusNames: Record<string, string> = {
  planning: 'Lên kế hoạch', active: 'Đang hoạt động', paused: 'Tạm dừng', completed: 'Hoàn thành',
  low: 'Thấp', medium: 'Trung bình', high: 'Cao', urgent: 'Khẩn cấp',
  not_started: 'Chưa triển khai', in_progress: 'Đang thực hiện', pending_review: 'Chờ kiểm duyệt',
  rejected: 'Bị từ chối', needs_update: 'Cần cập nhật', unverified: 'Chưa xác minh', verified: 'Đã xác minh',
  unreachable: 'Không truy cập được', removed: 'Đã bị xóa', recheck: 'Cần kiểm tra lại',
  inactive: 'Tạm dừng', research: 'Nghiên cứu', draft: 'Bản nháp', review: 'Chờ duyệt',
  ready: 'Sẵn sàng', published: 'Đã sử dụng', archived: 'Lưu trữ'
};

function statusTone(value: unknown): string {
  const tones: Record<string, string> = {
    active: 'green', completed: 'green', verified: 'green', published: 'green', ready: 'green',
    in_progress: 'blue', pending_review: 'amber', review: 'amber', recheck: 'amber',
    rejected: 'red', unreachable: 'red', removed: 'red', paused: 'neutral', inactive: 'neutral'
  };
  return tones[String(value)] || 'neutral';
}

function fieldOptions(field: FieldConfig, lookup: Lookup): FieldOption[] {
  if (field.name === 'project_id') return lookup.projects.map((item) => ({ value: String(item.id), label: item.name }));
  if (field.name === 'platform_id') return lookup.platforms.map((item) => ({ value: String(item.id), label: item.name }));
  if (field.name === 'profile_id') return lookup.profiles.map((item) => ({ value: String(item.id), label: item.name }));
  return field.options || [];
}

function formInitial(fields: FieldConfig[], row?: Row): Record<string, string | boolean> {
  return Object.fromEntries(fields.map((field) => {
    const value = row?.[field.name];
    if (field.type === 'checkbox') return [field.name, Boolean(value)];
    if (value !== undefined && value !== null) return [field.name, String(value)];
    if (field.type === 'select') return [field.name, field.options?.[0]?.value || ''];
    return [field.name, ''];
  }));
}

function renderCell(value: unknown, column: ResourceConfig['columns'][number], row: Row, lookup: Lookup) {
  if (column.render) return column.render(row, lookup);
  if (column.name === 'status' || column.name === 'priority' || column.name === 'verification_status') {
    const label = statusNames[String(value)] || String(value || '—');
    return <Badge tone={statusTone(value)}>{label}</Badge>;
  }
  if (column.name.endsWith('_at')) return formatDate(value);
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

export function ResourcePage({ kind, projectId }: { kind: ResourceKind; projectId?: number }) {
  const config = configs[kind];
  const { user } = useAuth();
  const { notify } = useToast();
  const [result, setResult] = useState<PageResult<Row> | null>(null);
  const [lookup, setLookup] = useState<Lookup>({ projects: [], platforms: [], profiles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.linkStats>> | null>(null);
  const canManage = Boolean(user && config.canManage(user.role));
  const formFields = projectId ? config.fields.filter((field) => field.name !== 'project_id') : config.fields;

  const loadLookup = useCallback(async () => {
    if (kind === 'platforms') return;
    const [projects, platforms, profiles] = await Promise.all([
      api.list<{ id: number; name: string }>('projects', { limit: 100 }),
      api.list<{ id: number; name: string }>('platforms', { limit: 100 }),
      kind === 'links' ? api.list<{ id: number; name: string }>('profiles', { limit: 100 }) : Promise.resolve({ data: [], pagination: { page: 1, limit: 100, total: 0, pages: 0 } })
    ]);
    setLookup({ projects: projects.data, platforms: platforms.data, profiles: profiles.data });
  }, [kind]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const filters: Record<string, string | number | undefined> = {
        page, limit: 20, q: query || undefined, status: statusFilter || undefined,
        project_id: projectId, category: categoryFilter || undefined, priority: priorityFilter || undefined
      };
      const [pageData] = await Promise.all([
        api.list<Row>(config.endpoint, filters),
        loadLookup()
      ]);
      setResult(pageData);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tải được dữ liệu');
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, config.endpoint, loadLookup, page, priorityFilter, projectId, query, statusFilter]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (kind === 'links') {
      api.linkStats().then(setStats).catch((requestError: unknown) => {
        notify(requestError instanceof Error ? requestError.message : 'Không tải được thống kê liên kết', 'error');
      });
    }
  }, [kind, notify, result]);

  const openCreate = () => {
    setEditing({ id: 0, ...formInitial(formFields) } as Row);
    setCreating(true);
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const payload: RecordData = {};
    for (const field of config.fields) {
      if (field.name === 'project_id' && projectId) {
        payload[field.name] = projectId;
        continue;
      }
      if (field.type === 'checkbox') {
        payload[field.name] = formData.has(field.name);
        continue;
      }
      const value = String(formData.get(field.name) || '').trim();
      if (!value && field.nullable) {
        payload[field.name] = null;
      } else if (value === '') {
        payload[field.name] = '';
      } else if (field.type === 'number' || ['project_id', 'platform_id', 'profile_id'].includes(field.name)) {
        payload[field.name] = Number(value);
      } else {
        payload[field.name] = value;
      }
    }
    setBusy(true);
    try {
      if (creating) await api.create(config.endpoint, payload);
      else if (editing) await api.update(config.endpoint, editing.id, payload);
      notify(`${creating ? 'Đã tạo' : 'Đã cập nhật'} ${config.noun}.`);
      setEditing(null);
      setCreating(false);
      await load();
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : 'Không lưu được dữ liệu', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: Row) => {
    if (!window.confirm(`Xóa ${config.noun} này? Thao tác không thể hoàn tác.`)) return;
    try {
      await api.remove(config.endpoint, row.id);
      notify(`Đã xóa ${config.noun}.`);
      await load();
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : 'Không thể xóa dữ liệu', 'error');
    }
  };

  const checkLink = async (row: Row) => {
    try {
      const checked = await api.checkLink(row.id);
      notify(checked.check_note, 'info');
      await load();
    } catch (requestError) {
      notify(requestError instanceof Error ? requestError.message : 'Không kiểm tra được URL', 'error');
    }
  };

  const labelForStatus = (option: FieldOption) => option.label;
  const availableStatuses = config.fields.find((field) => field.name === 'status')?.options;
  const optionLookup = lookup;

  return (
    <div className="page-stack">
      <PageTitle
        eyebrow={`QUẢN LÝ / ${config.title.toLocaleUpperCase('vi-VN')}`}
        title={config.title}
        description={config.description}
        action={canManage ? <Button onClick={openCreate}><Plus size={17} />Thêm {config.noun}</Button> : undefined}
      />
      {kind === 'links' && stats && !projectId && (
        <div className="link-stats-grid">
          <Card className="link-stat-card"><span>Đã ghi nhận</span><strong>{stats.by_platform.reduce((sum, item) => sum + item.count, 0)}</strong><small>liên kết trong workspace</small></Card>
          <Card className="link-stat-card"><span>Nền tảng có liên kết</span><strong>{stats.by_platform.filter((item) => item.count > 0).length}</strong><small>nguồn được theo dõi</small></Card>
          <Card className="link-stat-card"><span>Đang hoạt động</span><strong>{stats.by_platform.reduce((sum, item) => sum + item.active, 0)}</strong><small>theo trạng thái đã ghi nhận</small></Card>
          <Card className="link-stat-card link-stat-wide"><span>Trạng thái</span><div className="mini-statuses">{stats.by_status.map((item) => <span key={item.status}><b>{item.count}</b>{statusNames[item.status] || item.status}</span>)}</div></Card>
        </div>
      )}
      {kind === 'links' && <div className="simulation-notice"><Activity size={16} /><span><strong>Kiểm tra mô phỏng:</strong> chỉ kiểm tra định dạng URL; không truy cập Internet và không tự đổi trạng thái liên kết.</span></div>}
      <Card className="resource-card">
        <div className="resource-toolbar">
          <SearchBox value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder={`Tìm ${config.noun}...`} />
          <div className="filter-group">
            {availableStatuses && <Select aria-label="Lọc trạng thái" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="">Tất cả trạng thái</option>
              {availableStatuses.map((option) => <option value={option.value} key={option.value}>{labelForStatus(option)}</option>)}
            </Select>}
            {kind === 'platforms' && <>
              <Select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }} aria-label="Lọc danh mục">
                <option value="">Tất cả danh mục</option>
                {[...new Set(result?.data.map((row) => String(row.category || '')))].filter(Boolean).map((value) => <option key={value}>{value}</option>)}
              </Select>
              <Select value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setPage(1); }} aria-label="Lọc ưu tiên">
                <option value="">Mọi mức ưu tiên</option><option value="high">Cao</option><option value="medium">Trung bình</option><option value="low">Thấp</option>
              </Select>
            </>}
          </div>
        </div>
        {loading ? <Loading /> : error ? <div className="inline-error">{error}</div> : !result?.data.length ? (
          <EmptyState title={`Chưa có ${config.noun}`} description="Thử thay đổi từ khóa lọc hoặc tạo bản ghi mới." action={canManage ? <Button onClick={openCreate}><Plus size={16} />Thêm {config.noun}</Button> : undefined} />
        ) : (
          <>
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr>
                  {config.columns.map((column) => <th key={column.name}>{column.label}</th>)}
                  {canManage && <th className="actions-heading">Thao tác</th>}
                  {kind === 'links' && <th className="actions-heading">Kiểm tra</th>}
                </tr></thead>
                <tbody>
                  {result.data.map((row) => (
                    <tr key={row.id}>
                      {config.columns.map((column) => <td key={column.name}>{renderCell(row[column.name], column, row, optionLookup)}</td>)}
                      {canManage && <td className="row-actions">
                        <button className="icon-button row-action" title="Chỉnh sửa" onClick={() => { setEditing(row); setCreating(false); }}><Pencil size={15} /></button>
                        <button className="icon-button row-action row-action-danger" title="Xóa" onClick={() => void remove(row)}><Trash2 size={15} /></button>
                      </td>}
                      {kind === 'links' && <td><Button variant="secondary" className="small-button" onClick={() => void checkLink(row)}><Check size={14} />Kiểm tra</Button></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-footer"><span>{result.pagination.total} bản ghi</span><Pagination page={result.pagination.page} pages={result.pagination.pages} onChange={setPage} /></div>
          </>
        )}
      </Card>

      {editing && (
        <Modal title={`${creating ? 'Thêm' : 'Cập nhật'} ${config.noun}`} onClose={() => { setEditing(null); setCreating(false); }} wide>
          <ResourceForm
            fields={formFields}
            initial={creating ? formInitial(formFields) : formInitial(formFields, editing)}
            lookup={lookup}
            busy={busy}
            onSubmit={save}
            onCancel={() => { setEditing(null); setCreating(false); }}
          />
        </Modal>
      )}
    </div>
  );
}

function ResourceForm({
  fields,
  initial,
  lookup,
  busy,
  onSubmit,
  onCancel
}: {
  fields: FieldConfig[];
  initial: Record<string, string | boolean>;
  lookup: Lookup;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form className="resource-form" onSubmit={onSubmit}>
      <div className="form-grid">
        {fields.map((field) => {
          const value = initial[field.name];
          const inputId = `field-${field.name}`;
          if (field.type === 'checkbox') {
            return <label className="checkbox-field" key={field.name}><input type="checkbox" name={field.name} defaultChecked={Boolean(value)} /><span>{field.label}</span></label>;
          }
          return (
            <label className={`form-field ${field.type === 'textarea' ? 'form-field-wide' : ''}`} key={field.name} htmlFor={inputId}>
              <span>{field.label}{field.required && <i className="required-mark"> *</i>}</span>
              {field.type === 'textarea'
                ? <Textarea id={inputId} name={field.name} defaultValue={String(value || '')} rows={3} />
                : field.type === 'select'
                  ? <Select id={inputId} name={field.name} defaultValue={String(value || '')} required={field.required}>
                    {field.nullable && <option value="">Không chọn</option>}
                    {fieldOptions(field, lookup).map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
                  </Select>
                  : <Input id={inputId} name={field.name} type={field.type || 'text'} defaultValue={String(value || '')} placeholder={field.placeholder} required={field.required} />}
              {field.hint && <small className="field-hint">{field.hint}</small>}
            </label>
          );
        })}
      </div>
      <div className="modal-actions">
        <Button type="button" variant="secondary" onClick={onCancel}>Hủy</Button>
        <Button disabled={busy}>{busy ? 'Đang lưu...' : <><Check size={16} />Lưu thay đổi</>}</Button>
      </div>
    </form>
  );
}
