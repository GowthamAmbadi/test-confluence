import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { DashboardPage } from './DashboardPage';
import { HomePage } from './HomePage';

export function DashboardGate() {
  const { profile } = useAuth();

  if (profile?.role === 'CHECKIN_STAFF') {
    return <Navigate to="/check-in" replace />;
  }

  if (profile?.role === 'SUPPORT_DESK') {
    return <Navigate to="/support" replace />;
  }

  if (profile?.role === 'SUPER_ADMIN') {
    return <DashboardPage />;
  }

  return <HomePage />;
}
