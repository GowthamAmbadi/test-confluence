import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './components/AdminLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireRole } from './components/RequireRole';
import { AuthProvider } from './context/AuthContext';
import { AttendeeProfilePage } from './pages/AttendeeProfilePage';
import { CheckInPage } from './pages/CheckInPage';
import { DashboardGate } from './pages/DashboardGate';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { LoginPage } from './pages/LoginPage';
import { RegistrationsPage } from './pages/RegistrationsPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { SupportDeskPage } from './pages/SupportDeskPage';
import { TeamPage } from './pages/TeamPage';
import { OperationsPage } from './pages/OperationsPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AdminLayout />}>
              <Route index element={<DashboardGate />} />
              <Route
                path="support"
                element={(
                  <RequireRole allowedRoles={['SUPER_ADMIN', 'SUPPORT_DESK', 'CHECKIN_STAFF']}>
                    <SupportDeskPage />
                  </RequireRole>
                )}
              />
              <Route
                path="support/:registrationId"
                element={(
                  <RequireRole allowedRoles={['SUPER_ADMIN', 'SUPPORT_DESK', 'CHECKIN_STAFF']}>
                    <SupportDeskPage />
                  </RequireRole>
                )}
              />
              <Route
                path="check-in"
                element={(
                  <RequireRole allowedRoles={['SUPER_ADMIN', 'SUPPORT_DESK', 'CHECKIN_STAFF']}>
                    <CheckInPage />
                  </RequireRole>
                )}
              />
              <Route
                path="registrations"
                element={(
                  <RequireRole allowedRoles={['SUPER_ADMIN', 'SUPPORT_DESK', 'CHECKIN_STAFF']}>
                    <RegistrationsPage />
                  </RequireRole>
                )}
              />
              <Route
                path="registrations/:registrationId"
                element={(
                  <RequireRole allowedRoles={['SUPER_ADMIN', 'SUPPORT_DESK', 'CHECKIN_STAFF']}>
                    <AttendeeProfilePage />
                  </RequireRole>
                )}
              />
              <Route
                path="operations"
                element={(
                  <RequireRole allowedRoles={['SUPER_ADMIN', 'SUPPORT_DESK']}>
                    <OperationsPage />
                  </RequireRole>
                )}
              />
              <Route
                path="team"
                element={(
                  <RequireRole allowedRoles={['SUPER_ADMIN']}>
                    <TeamPage />
                  </RequireRole>
                )}
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
