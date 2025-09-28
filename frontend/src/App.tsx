import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CertificatesPage from './pages/CertificatesPage';
import AlertModelsPage from './pages/AlertModelsPage';
import SettingsPage from './pages/SettingsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import ChannelsPage from './pages/ChannelsPage';
import UsersPage from './pages/UsersPage';
import AccessDeniedPage from './pages/AccessDeniedPage';
import DashboardLayout from './layouts/DashboardLayout';
import LoadingScreen from './components/LoadingScreen';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingScreen message="Carregando sessão..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const RoleRoute: React.FC<{ allowed: Array<'admin' | 'editor' | 'viewer'>; children: React.ReactNode }> = ({
  allowed,
  children
}) => {
  const { user } = useAuth();
  if (!user) {
    return <AccessDeniedPage />;
  }
  if (!allowed.includes(user.role)) {
    return <AccessDeniedPage />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="certificates" element={<CertificatesPage />} />
          <Route path="alert-models" element={<AlertModelsPage />} />
          <Route path="channels" element={<ChannelsPage />} />
          <Route
            path="users"
            element={
              <RoleRoute allowed={['admin']}>
                <UsersPage />
              </RoleRoute>
            }
          />
          <Route
            path="settings"
            element={
              <RoleRoute allowed={['admin', 'editor']}>
                <SettingsPage />
              </RoleRoute>
            }
          />
          <Route path="audit-logs" element={<AuditLogsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
