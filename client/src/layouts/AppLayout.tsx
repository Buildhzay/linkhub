import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, BarChart3, BriefcaseBusiness, CheckSquare, ChevronDown, CircleUserRound,
  FileText, Globe2, LayoutDashboard, Link2, LogOut, Menu, Network, PanelLeftClose,
  PanelLeftOpen, UserRound, X
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import type { Role } from '../types';

const navigation = [
  { label: 'Tổng quan', path: '/', icon: LayoutDashboard, roles: ['admin', 'manager', 'staff'] as Role[] },
  { label: 'Dự án', path: '/projects', icon: BriefcaseBusiness, roles: ['admin', 'manager', 'staff'] as Role[] },
  { label: 'Nền tảng', path: '/platforms', icon: Globe2, roles: ['admin', 'manager', 'staff'] as Role[] },
  { label: 'Hồ sơ', path: '/profiles', icon: CircleUserRound, roles: ['admin', 'manager', 'staff'] as Role[] },
  { label: 'Liên kết', path: '/links', icon: Link2, roles: ['admin', 'manager', 'staff'] as Role[] },
  { label: 'Công việc', path: '/tasks', icon: CheckSquare, roles: ['admin', 'manager', 'staff'] as Role[] },
  { label: 'Nội dung', path: '/contents', icon: FileText, roles: ['admin', 'manager', 'staff'] as Role[] },
  { label: 'Báo cáo', path: '/reports', icon: BarChart3, roles: ['admin', 'manager'] as Role[] },
  { label: 'Người dùng', path: '/users', icon: UserRound, roles: ['admin'] as Role[] },
  { label: 'Nhật ký', path: '/activity', icon: Activity, roles: ['admin', 'manager', 'staff'] as Role[] }
];

const titles: Record<string, string> = {
  '/': 'Tổng quan',
  '/projects': 'Dự án',
  '/platforms': 'Nền tảng',
  '/profiles': 'Hồ sơ',
  '/links': 'Liên kết',
  '/tasks': 'Công việc',
  '/contents': 'Nội dung',
  '/reports': 'Báo cáo',
  '/users': 'Người dùng',
  '/activity': 'Nhật ký hoạt động'
};

const roleLabel: Record<Role, string> = { admin: 'Quản trị viên', manager: 'Quản lý', staff: 'Nhân viên' };

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { notify } = useToast();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  if (!user) return null;

  const title = location.pathname.startsWith('/projects/')
    ? 'Chi tiết dự án'
    : titles[location.pathname] || 'LINKHUB';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Đã đăng xuất khỏi thiết bị', 'info');
    }
  };

  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      {mobileOpen && <button className="mobile-scrim" onClick={() => setMobileOpen(false)} aria-label="Đóng menu" />}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark"><Network size={20} /></div>
          <div className="brand-copy"><strong>LINKHUB</strong><span>Presence workspace</span></div>
          <button className="mobile-close icon-button" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><X size={18} /></button>
        </div>
        <div className="workspace-switcher">
          <span className="workspace-dot" />
          <span className="workspace-name">Workspace demo</span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-caption">QUẢN LÝ</div>
        <nav className="side-nav">
          {navigation.filter((item) => item.roles.includes(user.role)).map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                to={item.path}
                end={item.path === '/'}
                key={item.path}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note"><span className="demo-pulse" />DEMO • Dữ liệu mẫu</div>
          <div className="sidebar-profile">
            <div className="avatar">{user.full_name.slice(0, 1).toUpperCase()}</div>
            <div className="profile-copy"><strong>{user.full_name}</strong><span>{roleLabel[user.role]}</span></div>
            <button type="button" className="icon-button signout-button" onClick={handleSignOut} title="Đăng xuất" aria-label="Đăng xuất"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-leading">
            <button type="button" className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Menu size={20} /></button>
            <button type="button" className="collapse-toggle icon-button" onClick={() => setCollapsed((value) => !value)} aria-label="Thu gọn thanh bên">
              {collapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
            </button>
            <div className="topbar-breadcrumb"><span>LINKHUB</span><span className="breadcrumb-separator">/</span><strong>{title}</strong></div>
          </div>
          <div className="topbar-right">
            <div className="environment-tag"><span />Môi trường demo</div>
            <div className="topbar-avatar">{user.full_name.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
    </div>
  );
}
