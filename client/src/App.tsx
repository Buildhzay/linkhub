import { Navigate, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage, ProjectDetailPage } from './pages/ProjectsPage';
import { ResourcePage } from './pages/ResourcePage';
import { KanbanPage } from './pages/KanbanPage';
import { ReportsPage } from './pages/ReportsPage';
import { ActivityPage } from './pages/ActivityPage';
import { UsersPage } from './pages/UsersPage';
import { Loading } from './components/ui';
import type { Role } from './types';

function Protected({
  children,
  roles
}: {
  children: ReactNode;
  roles?: Role[];
}) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Đang kiểm tra phiên đăng nhập..." />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function RouterView() {
  const { user } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<Protected><AppLayout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:id" element={<ProjectDetailPage />} />
        <Route path="platforms" element={<ResourcePage kind="platforms" />} />
        <Route path="profiles" element={<ResourcePage kind="profiles" />} />
        <Route path="links" element={<ResourcePage kind="links" />} />
        <Route path="tasks" element={<KanbanPage />} />
        <Route path="contents" element={<ResourcePage kind="contents" />} />
        <Route path="reports" element={<Protected roles={['admin', 'manager']}><ReportsPage /></Protected>} />
        <Route path="users" element={<Protected roles={['admin']}><UsersPage /></Protected>} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterView />
      </ToastProvider>
    </AuthProvider>
  );
}
