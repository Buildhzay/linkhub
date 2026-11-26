import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Eye, EyeOff, Link2, LockKeyhole, Mail, Network, Sparkles } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Button, Input } from '../components/ui';

const demoAccounts = [
  { role: 'Admin', username: 'admin', password: 'Admin@123', tone: 'account-admin' },
  { role: 'Quản lý', username: 'manager', password: 'Manager@123', tone: 'account-manager' },
  { role: 'Nhân viên', username: 'staff', password: 'Staff@123', tone: 'account-staff' }
];

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(username.trim(), password);
      const state = location.state as { from?: { pathname?: string } } | null;
      navigate(state?.from?.pathname || '/', { replace: true });
    } catch (requestError) {
      setError(requestError instanceof ApiError && requestError.status === 429
        ? requestError.message
        : requestError instanceof Error ? requestError.message : 'Không thể đăng nhập');
    } finally {
      setBusy(false);
    }
  };

  const useDemo = (account: typeof demoAccounts[number]) => {
    setUsername(account.username);
    setPassword(account.password);
    setError('');
  };

  return (
    <main className="login-page">
      <section className="login-showcase">
        <div className="login-brand">
          <div className="brand-mark brand-mark-large"><Network size={23} /></div>
          <div><strong>LINKHUB</strong><span>Digital presence management</span></div>
        </div>
        <div className="showcase-content">
          <div className="showcase-chip"><Sparkles size={14} />WORKSPACE CHO ĐỘI NGŨ MARKETING</div>
          <h1>Mọi điểm chạm.<br /><span>Một tầm nhìn.</span></h1>
          <p>Quản lý dự án, hồ sơ nền tảng, liên kết và tiến độ triển khai trong một không gian làm việc thống nhất.</p>
          <div className="showcase-diagram" aria-hidden="true">
            <div className="diagram-center"><Link2 size={26} /><span>Website chính</span></div>
            <div className="diagram-node node-one">Nội dung</div>
            <div className="diagram-node node-two">Hồ sơ</div>
            <div className="diagram-node node-three">Nền tảng</div>
            <div className="diagram-node node-four">Báo cáo</div>
            <span className="diagram-orbit orbit-one" /><span className="diagram-orbit orbit-two" />
          </div>
        </div>
        <div className="showcase-footer"><span>LINKHUB DEMO</span><span>Quản lý hiện diện số có trách nhiệm</span></div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <div className="mobile-login-brand"><div className="brand-mark"><Network size={18} /></div><strong>LINKHUB</strong></div>
          <div className="login-heading">
            <span className="eyebrow">CHÀO MỪNG TRỞ LẠI</span>
            <h2>Đăng nhập</h2>
            <p>Nhập tài khoản để tiếp tục tới workspace của bạn.</p>
          </div>
          <form onSubmit={submit} className="login-form">
            <label className="form-field">
              <span>Tên đăng nhập</span>
              <div className="input-with-icon"><Mail size={17} /><Input autoFocus autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Ví dụ: manager" required /></div>
            </label>
            <label className="form-field">
              <span>Mật khẩu</span>
              <div className="input-with-icon"><LockKeyhole size={17} /><Input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Nhập mật khẩu" required />
                <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>
            {error && <div className="form-error" role="alert">{error}</div>}
            <Button className="login-submit" disabled={busy}>{busy ? 'Đang đăng nhập...' : <>Đăng nhập <ArrowRight size={17} /></>}</Button>
          </form>
          <div className="demo-accounts">
            <div className="demo-accounts-heading"><span>TÀI KHOẢN DEMO</span><span>Chọn để điền nhanh</span></div>
            <div className="demo-account-list">
              {demoAccounts.map((account) => (
                <button key={account.username} type="button" className={`demo-account ${account.tone}`} onClick={() => useDemo(account)}>
                  <span className="demo-account-dot" /><span>{account.role}</span><ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
          <div className="login-disclaimer">Tài khoản và dữ liệu chỉ dùng cho môi trường trình diễn.</div>
        </div>
      </section>
    </main>
  );
}
