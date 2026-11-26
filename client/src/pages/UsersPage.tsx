import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { KeyRound, Pencil, Plus, Shield, Trash2, UserRound } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, Input, Loading, Modal, PageTitle, Select } from '../components/ui';
import type { PageResult, RecordData, User } from '../types';

const roleLabels = { admin: 'Quản trị viên', manager: 'Quản lý', staff: 'Nhân viên' };

function roleTone(role: string) {
  return role === 'admin' ? 'violet' : role === 'manager' ? 'blue' : 'neutral';
}

export function UsersPage() {
  const { notify } = useToast();
  const [result, setResult] = useState<PageResult<User> | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await api.list<User>('users', { q: search || undefined, page, limit: 20 }));
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tải được danh sách người dùng', 'error');
    } finally {
      setLoading(false);
    }
  }, [notify, page, search]);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: RecordData = {
      username: String(form.get('username') || '').trim(),
      full_name: String(form.get('full_name') || '').trim(),
      email: String(form.get('email') || '').trim(),
      role: String(form.get('role') || 'staff')
    };
    const password = String(form.get('password') || '');
    if (password) payload.password = password;
    if (creating) payload.password = password;
    if (form.has('is_active')) payload.is_active = true;
    else if (!creating) payload.is_active = false;

    setBusy(true);
    try {
      if (creating) await api.create('users', payload);
      else if (editing) await api.update('users', editing.id, payload);
      notify(creating ? 'Đã tạo người dùng.' : 'Đã cập nhật người dùng.');
      setCreating(false);
      setEditing(null);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không lưu được người dùng', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (user: User) => {
    if (!window.confirm(`Xóa tài khoản ${user.username}? Nếu đã được sử dụng trong dữ liệu, hệ thống sẽ chặn thao tác này.`)) return;
    try {
      await api.remove('users', user.id);
      notify('Đã xóa tài khoản.');
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không xóa được tài khoản', 'error');
    }
  };

  return (
    <div className="page-stack">
      <PageTitle eyebrow="HỆ THỐNG / NGƯỜI DÙNG" title="Quản lý người dùng" description="Quản lý tài khoản demo và quyền truy cập theo vai trò."
        action={<div className="page-action-group"><label className="project-search"><UserRound size={16} /><input placeholder="Tìm tài khoản..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><Button onClick={() => { setCreating(true); setEditing(null); }}><Plus size={17} />Thêm người dùng</Button></div>} />
      <div className="role-overview">
        <Card><span className="role-icon role-admin"><Shield size={17} /></span><div><strong>Admin</strong><small>Quản trị toàn hệ thống</small></div></Card>
        <Card><span className="role-icon role-manager"><UserRound size={17} /></span><div><strong>Manager</strong><small>Quản lý dự án và báo cáo</small></div></Card>
        <Card><span className="role-icon role-staff"><KeyRound size={17} /></span><div><strong>Staff</strong><small>Triển khai hồ sơ, nội dung, liên kết</small></div></Card>
      </div>
      <Card className="resource-card">
        {loading ? <Loading /> : !result?.data.length ? <EmptyState title="Chưa có người dùng" /> : <>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>Tài khoản</th><th>Email</th><th>Vai trò</th><th>Trạng thái</th><th>Ngày tạo</th><th className="actions-heading">Thao tác</th></tr></thead><tbody>
            {result.data.map((user) => <tr key={user.id}>
              <td><div className="user-table-name"><span className="avatar avatar-small">{user.full_name.slice(0, 1)}</span><div><strong>{user.full_name}</strong><small>@{user.username}</small></div></div></td>
              <td>{user.email}</td>
              <td><Badge tone={roleTone(user.role)}>{roleLabels[user.role]}</Badge></td>
              <td><Badge tone={user.is_active ? 'green' : 'red'}>{user.is_active ? 'Đang hoạt động' : 'Đã khóa'}</Badge></td>
              <td>{new Date(user.created_at).toLocaleDateString('vi-VN')}</td>
              <td className="row-actions"><button className="icon-button row-action" title="Chỉnh sửa" onClick={() => { setEditing(user); setCreating(false); }}><Pencil size={15} /></button><button className="icon-button row-action row-action-danger" title="Xóa" onClick={() => void remove(user)}><Trash2 size={15} /></button></td>
            </tr>)}
          </tbody></table></div>
          <div className="table-footer"><span>{result.pagination.total} người dùng</span><div className="pagination-actions"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Trước</Button><span>Trang {page} / {Math.max(result.pagination.pages, 1)}</span><Button variant="secondary" disabled={page >= result.pagination.pages} onClick={() => setPage((value) => value + 1)}>Tiếp</Button></div></div>
        </>}
      </Card>
      {(creating || editing) && <Modal title={creating ? 'Tạo tài khoản' : 'Cập nhật tài khoản'} onClose={() => { setCreating(false); setEditing(null); }}>
        <form className="resource-form" onSubmit={submit}>
          <div className="form-grid">
            <label className="form-field"><span>Họ tên *</span><Input name="full_name" defaultValue={editing?.full_name || ''} required /></label>
            <label className="form-field"><span>Tên đăng nhập *</span><Input name="username" defaultValue={editing?.username || ''} required /></label>
            <label className="form-field"><span>Email *</span><Input name="email" type="email" defaultValue={editing?.email || ''} required /></label>
            <label className="form-field"><span>Vai trò</span><Select name="role" defaultValue={editing?.role || 'staff'}><option value="admin">Quản trị viên</option><option value="manager">Quản lý</option><option value="staff">Nhân viên</option></Select></label>
            <label className="form-field form-field-wide"><span>Mật khẩu {creating ? '*' : '(để trống để giữ nguyên)'}</span><Input name="password" type="password" minLength={10} required={creating} autoComplete="new-password" /></label>
            {!creating && <label className="checkbox-field"><input type="checkbox" name="is_active" defaultChecked={editing?.is_active} /><span>Tài khoản đang hoạt động</span></label>}
          </div>
          <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => { setCreating(false); setEditing(null); }}>Hủy</Button><Button disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu tài khoản'}</Button></div>
        </form>
      </Modal>}
    </div>
  );
}
