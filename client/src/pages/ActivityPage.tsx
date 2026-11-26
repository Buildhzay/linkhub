import { useCallback, useEffect, useState } from 'react';
import { Activity, CircleUserRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Badge, Card, EmptyState, Loading, PageTitle, Pagination } from '../components/ui';
import type { Activity as ActivityItem, PageResult } from '../types';

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    create: 'Tạo mới', update: 'Cập nhật', delete: 'Xóa', check: 'Kiểm tra',
    export: 'Xuất báo cáo', login: 'Đăng nhập', logout: 'Đăng xuất', seed: 'Khởi tạo'
  };
  return labels[action] || action;
}

function entityLabel(entity: string) {
  const labels: Record<string, string> = {
    project: 'Dự án',
    platform: 'Nền tảng',
    profile: 'Hồ sơ',
    link: 'Liên kết',
    task: 'Công việc',
    content: 'Nội dung',
    user: 'Người dùng',
    report: 'Báo cáo',
    system: 'Hệ thống'
  };
  return labels[entity] || entity;
}

export function ActivityPage() {
  const { user } = useAuth();
  const [result, setResult] = useState<PageResult<ActivityItem> | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await api.list<ActivityItem>('activity-logs', { page, limit: 20 }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không tải được nhật ký');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="page-stack">
      <PageTitle eyebrow="HỆ THỐNG / NHẬT KÝ" title="Nhật ký hoạt động" description={user?.role === 'staff' ? 'Bạn chỉ xem được các hoạt động do tài khoản của mình thực hiện.' : 'Theo dõi các thao tác quan trọng trong workspace.'} />
      <Card className="activity-page-card">
        {loading ? <Loading /> : error ? <div className="inline-error">{error}</div> : !result?.data.length ? <EmptyState title="Chưa có hoạt động" /> : (
          <>
            <div className="activity-timeline">
              {result.data.map((item) => (
                <article className="timeline-item" key={item.id}>
                  <div className="timeline-icon"><Activity size={16} /></div>
                  <div className="timeline-body">
                    <div className="timeline-title"><strong>{item.message}</strong><Badge tone="neutral">{actionLabel(item.action)}</Badge></div>
                    <div className="timeline-meta"><span><CircleUserRound size={14} />{item.user_name || 'Người dùng đã xóa'}</span><span>{entityLabel(item.entity_type)}{item.entity_id ? ` #${item.entity_id}` : ''}</span><time>{new Date(item.created_at).toLocaleString('vi-VN')}</time></div>
                  </div>
                </article>
              ))}
            </div>
            <div className="table-footer"><span>{result.pagination.total} hoạt động</span><Pagination page={result.pagination.page} pages={result.pagination.pages} onChange={setPage} /></div>
          </>
        )}
      </Card>
    </div>
  );
}
