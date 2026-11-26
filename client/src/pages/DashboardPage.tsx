import { useEffect, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowUpRight, BriefcaseBusiness, CheckCircle2,
  CircleDashed, ExternalLink, Globe2, Link2, UsersRound
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { api } from '../api';
import { Badge, Card, Loading, PageTitle } from '../components/ui';
import type { DashboardData } from '../types';

const chartColors = ['#258a7e', '#e3a34b', '#6384b2', '#9d78b8', '#d97565', '#76a890'];
const linkStatusLabels: Record<string, string> = {
  active: 'Đang hoạt động',
  unverified: 'Chưa xác minh',
  unreachable: 'Không truy cập được',
  removed: 'Đã gỡ bỏ',
  recheck: 'Cần kiểm tra lại'
};

function StatCard({
  label,
  value,
  icon: Icon,
  note,
  color,
  trend
}: {
  label: string;
  value: number;
  icon: typeof BriefcaseBusiness;
  note: string;
  color: string;
  trend?: string;
}) {
  return (
    <Card className="stat-card">
      <div className="stat-top"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={19} /></span></div>
      <div className="stat-value">{value.toLocaleString('vi-VN')}</div>
      <div className="stat-note">{trend && <span className="stat-trend"><ArrowUpRight size={14} />{trend}</span>}{note}</div>
    </Card>
  );
}

function formatShortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' });
}

export function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard().then(setData).catch((requestError: unknown) => {
      setError(requestError instanceof Error ? requestError.message : 'Không tải được Dashboard');
    });
  }, []);

  if (error) return <div className="page-error">{error}</div>;
  if (!data) return <Loading />;

  const { totals } = data;
  const taskStatus = [
    { name: 'Hoàn thành', value: totals.completed_tasks },
    { name: 'Còn lại', value: Math.max(totals.tasks - totals.completed_tasks, 0) }
  ];

  return (
    <div className="page-stack">
      <PageTitle
        eyebrow="WORKSPACE / TỔNG QUAN"
        title="Chào mừng đến với LINKHUB"
        description="Theo dõi tiến độ và hiệu quả hiện diện số của các dự án."
        action={<div className="date-chip"><Activity size={15} />Dữ liệu cập nhật trực tiếp</div>}
      />
      <div className="stats-grid">
        <StatCard label="Tổng dự án" value={totals.projects} icon={BriefcaseBusiness} note="dự án trong workspace" color="stat-blue" />
        <StatCard label="Nền tảng" value={totals.platforms} icon={Globe2} note="trong kho nền tảng" color="stat-violet" />
        <StatCard label="Hồ sơ hoàn tất" value={totals.completed_profiles} icon={CircleDashed} note={`${totals.in_progress_profiles} đang triển khai`} color="stat-amber" />
        <StatCard label="Liên kết hoạt động" value={totals.active_links} icon={Link2} note={`${totals.links} liên kết đã ghi nhận`} color="stat-green" />
      </div>

      <div className="dashboard-main-grid">
        <Card className="chart-card">
          <div className="card-heading">
            <div><h2>Tiến độ công việc</h2><p>Nhiệm vụ hoàn thành theo ngày ghi nhận</p></div>
            <Badge tone="brand">{totals.completion_rate}% hoàn thành</Badge>
          </div>
          <div className="chart-wrap chart-tall">
            {data.progress_by_day.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.progress_by_day} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="#edf1f4" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatShortDate} axisLine={false} tickLine={false} tick={{ fill: '#8a97a6', fontSize: 11 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8a97a6', fontSize: 11 }} />
                  <Tooltip labelFormatter={(value) => formatShortDate(String(value))} contentStyle={{ borderRadius: 10, borderColor: '#e6ebf0' }} />
                  <Line type="monotone" dataKey="count" name="Công việc hoàn tất" stroke="#258a7e" strokeWidth={3} dot={{ r: 3, fill: '#258a7e' }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div className="chart-empty">Chưa có dữ liệu hoàn thành theo ngày.</div>}
          </div>
        </Card>
        <Card className="completion-card">
          <div className="card-heading"><div><h2>Tỷ lệ hoàn thành</h2><p>Trạng thái nhiệm vụ hiện tại</p></div></div>
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={taskStatus} dataKey="value" innerRadius={66} outerRadius={88} paddingAngle={3} stroke="none" startAngle={90} endAngle={-270}>
                  {taskStatus.map((entry, index) => <Cell key={entry.name} fill={index === 0 ? '#258a7e' : '#e8eef0'} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-label"><strong>{totals.completion_rate}%</strong><span>hoàn tất</span></div>
          </div>
          <div className="completion-legend">
            <div><span className="legend-dot legend-brand" /><span>Đã hoàn thành</span><strong>{totals.completed_tasks}</strong></div>
            <div><span className="legend-dot legend-gray" /><span>Đang xử lý / chờ</span><strong>{Math.max(totals.tasks - totals.completed_tasks, 0)}</strong></div>
          </div>
        </Card>
      </div>

      <div className="dashboard-lower-grid">
        <Card className="chart-card">
          <div className="card-heading"><div><h2>Danh mục nền tảng</h2><p>Phân bổ theo loại nền tảng</p></div></div>
          <div className="chart-wrap chart-medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.platforms_by_category} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid stroke="#edf1f4" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="category" axisLine={false} tickLine={false} tick={{ fill: '#8a97a6', fontSize: 11 }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8a97a6', fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 10, borderColor: '#e6ebf0' }} />
                <Bar dataKey="count" name="Nền tảng" radius={[6, 6, 0, 0]}>
                  {data.platforms_by_category.map((row, index) => <Cell key={row.category} fill={chartColors[index % chartColors.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="chart-card">
          <div className="card-heading"><div><h2>Trạng thái liên kết</h2><p>{totals.links} liên kết trong hệ thống</p></div><Link2 size={18} className="heading-muted-icon" /></div>
          <div className="chart-wrap chart-medium">
            {data.links_by_status.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.links_by_status} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 12 }}>
                  <CartesianGrid stroke="#edf1f4" strokeDasharray="4 4" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#8a97a6', fontSize: 10 }} />
                  <YAxis type="category" dataKey="status" axisLine={false} tickLine={false} width={110} tickFormatter={(value: string) => linkStatusLabels[value] || value} tick={{ fill: '#718092', fontSize: 9 }} />
                  <Tooltip
                    labelFormatter={(value) => linkStatusLabels[String(value)] || String(value)}
                    contentStyle={{ borderRadius: 10, borderColor: '#e6ebf0' }}
                  />
                  <Bar dataKey="count" name="Liên kết" radius={[0, 5, 5, 0]}>
                    {data.links_by_status.map((row, index) => <Cell key={row.status} fill={chartColors[index % chartColors.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div className="chart-empty">Chưa có liên kết.</div>}
          </div>
        </Card>
      </div>

      <div className="dashboard-bottom-grid">
        <Card className="table-card">
          <div className="card-heading"><div><h2>Công việc sắp đến hạn</h2><p>Ưu tiên các đầu việc gần hạn</p></div><CheckCircle2 size={18} className="heading-muted-icon" /></div>
          {data.upcoming_tasks.length ? (
            <div className="upcoming-list">
              {data.upcoming_tasks.map((task) => (
                <div className="upcoming-item" key={task.id}>
                  <span className="task-priority-mark" data-priority={task.priority} />
                  <div className="upcoming-copy"><strong>{task.title}</strong><span>{task.project_name} · {task.assignee_name}</span></div>
                  <time>{formatShortDate(task.due_date)}</time>
                </div>
              ))}
            </div>
          ) : <div className="compact-empty">Không có công việc đang chờ hạn.</div>}
        </Card>
        <Card className="table-card">
          <div className="card-heading"><div><h2>Hoạt động gần đây</h2><p>Nhật ký thay đổi mới nhất</p></div><UsersRound size={18} className="heading-muted-icon" /></div>
          <div className="activity-list">
            {data.latest_activity.map((item) => (
              <div className="activity-item" key={item.id}>
                <div className="activity-avatar">{(item.user_name || 'S').slice(0, 1)}</div>
                <div className="activity-copy"><strong>{item.user_name || 'Hệ thống'}</strong><span>{item.message}</span></div>
                <time>{formatShortDate(item.created_at)}</time>
              </div>
            ))}
            {!data.latest_activity.length && <div className="compact-empty"><ArrowDownRight size={15} />Chưa có hoạt động.</div>}
          </div>
        </Card>
      </div>
      <div className="dashboard-footnote"><ExternalLink size={14} />Số liệu được tổng hợp từ dữ liệu hiện có trong hệ thống demo.</div>
    </div>
  );
}
