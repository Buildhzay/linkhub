import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CalendarRange, Download, FileSpreadsheet, FileText, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, Input, Loading, PageTitle, Select } from '../components/ui';
import type { PageResult, Platform, Project } from '../types';

interface ReportRecord {
  id: number;
  project_id: number | null;
  title: string;
  report_type: 'overview' | 'project' | 'platform' | 'period';
  params_json: string;
  format: 'xlsx' | 'pdf';
  created_by_name: string;
  created_at: string;
}

const reportTypeLabels: Record<ReportRecord['report_type'], string> = {
  overview: 'Tổng hợp',
  project: 'Theo dự án',
  platform: 'Theo nền tảng',
  period: 'Theo thời gian'
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsPage() {
  const { notify } = useToast();
  const [projects, setProjects] = useState<Project[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [reports, setReports] = useState<PageResult<ReportRecord> | null>(null);
  const [reportType, setReportType] = useState<ReportRecord['report_type']>('overview');
  const [format, setFormat] = useState<'xlsx' | 'pdf'>('xlsx');
  const [projectId, setProjectId] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const formatNote = format === 'pdf'
    ? 'PDF ngang; font mặc định không hỗ trợ đầy đủ dấu tiếng Việt.'
    : reportType === 'period'
      ? 'Bao gồm tổng quan, hiệu suất nền tảng, trạng thái và xu hướng theo tuần.'
      : 'Bao gồm tổng quan, hiệu suất nền tảng và trạng thái.';

  const load = async () => {
    setLoading(true);
    try {
      const [projectData, platformData, reportData] = await Promise.all([
        api.list<Project>('projects', { limit: 100 }),
        api.list<Platform>('platforms', { limit: 100 }),
        api.list<ReportRecord>('reports', { limit: 20 })
      ]);
      setProjects(projectData.data);
      setPlatforms(platformData.data);
      setReports(reportData);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không tải được dữ liệu báo cáo', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (reportType === 'project' && !projectId) {
      notify('Chọn một dự án để tạo báo cáo.', 'error');
      return;
    }
    if (reportType === 'platform' && !platformId) {
      notify('Chọn một nền tảng để tạo báo cáo.', 'error');
      return;
    }
    if (reportType === 'period' && !startDate && !endDate) {
      notify('Chọn ít nhất một mốc thời gian.', 'error');
      return;
    }
    setBusy(true);
    try {
      const blob = await api.exportReport({
        report_type: reportType,
        format,
        project_id: projectId ? Number(projectId) : undefined,
        platform_id: platformId ? Number(platformId) : undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined
      });
      downloadBlob(blob, `linkhub-report-${new Date().toISOString().slice(0, 10)}.${format}`);
      notify(`Đã xuất báo cáo ${format.toUpperCase()}.`);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Không thể xuất báo cáo', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-stack">
      <PageTitle eyebrow="PHÂN TÍCH / BÁO CÁO" title="Báo cáo" description="Tổng hợp tiến độ và hiệu suất từ dữ liệu thực tế trong hệ thống." />
      <div className="report-layout">
        <Card className="report-builder">
          <div className="card-heading"><div><h2>Tạo báo cáo</h2><p>Chọn phạm vi và định dạng cần xuất.</p></div><CalendarRange className="heading-muted-icon" size={19} /></div>
          <form className="report-form" onSubmit={submit}>
            <label className="form-field"><span>Loại báo cáo</span><Select value={reportType} onChange={(event) => setReportType(event.target.value as ReportRecord['report_type'])}>
              <option value="overview">Tổng hợp toàn hệ thống</option><option value="project">Theo dự án</option><option value="platform">Theo nền tảng</option><option value="period">Theo thời gian</option>
            </Select></label>
            {reportType === 'project' && <label className="form-field"><span>Dự án *</span><Select value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Chọn dự án</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</Select></label>}
            {reportType === 'platform' && <label className="form-field"><span>Nền tảng *</span><Select value={platformId} onChange={(event) => setPlatformId(event.target.value)} required><option value="">Chọn nền tảng</option>{platforms.map((platform) => <option value={platform.id} key={platform.id}>{platform.name}</option>)}</Select></label>}
            {reportType === 'period' && <div className="report-date-grid">
              <label className="form-field"><span>Từ ngày</span><Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
              <label className="form-field"><span>Đến ngày</span><Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
            </div>}
            <label className="form-field"><span>Định dạng tệp</span><Select value={format} onChange={(event) => setFormat(event.target.value as 'xlsx' | 'pdf')}>
              <option value="xlsx">Excel (.xlsx) — {reportType === 'period' ? 5 : 4} trang tính</option><option value="pdf">PDF (.pdf)</option>
            </Select></label>
            <div className="report-format-note">{format === 'xlsx' ? <FileSpreadsheet size={16} /> : <FileText size={16} />}<span>{formatNote}</span></div>
            <Button className="report-submit" disabled={busy}>{busy ? <><RefreshCw className="spin" size={16} />Đang tổng hợp...</> : <><Download size={16} />Xuất báo cáo</>}</Button>
          </form>
        </Card>
        <Card className="report-history">
          <div className="card-heading"><div><h2>Lịch sử xuất</h2><p>Các báo cáo đã tạo gần đây</p></div><Badge tone="neutral">{reports?.pagination.total || 0}</Badge></div>
          {loading ? <Loading /> : !reports?.data.length ? <div className="compact-empty">Chưa có báo cáo được xuất.</div> : (
            <div className="report-history-list">
              {reports.data.map((report) => (
                <div className="report-history-item" key={report.id}>
                  <div className={`report-file-icon ${report.format}`}><FileText size={17} /></div>
                  <div className="report-history-copy"><strong>{report.title}</strong><span>{reportTypeLabels[report.report_type] || report.report_type} · {report.created_by_name}</span></div>
                  <div className="report-history-meta"><Badge tone={report.format === 'xlsx' ? 'green' : 'red'}>{report.format.toUpperCase()}</Badge><time>{new Date(report.created_at).toLocaleDateString('vi-VN')}</time></div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <Card className="report-disclaimer"><span className="disclaimer-mark">i</span><p><strong>Ghi chú dữ liệu:</strong> báo cáo được tổng hợp từ bản ghi trong hệ thống demo. Trạng thái liên kết là dữ liệu quản lý nội bộ, không phải xác minh trực tiếp trên Internet.</p></Card>
    </div>
  );
}
