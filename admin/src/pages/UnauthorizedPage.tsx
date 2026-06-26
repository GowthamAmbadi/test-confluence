import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../lib/permissions';

export function UnauthorizedPage() {
  const { profile } = useAuth();

  return (
    <div className="page-panel page-center-inline">
      <h2>Access denied</h2>
      <p className="page-sub">
        {profile
          ? `Your role (${ROLE_LABELS[profile.role]}) does not have permission to view this page.`
          : 'You do not have permission to view this page.'}
      </p>
      <Link to="/" className="btn btn-primary">Back to home</Link>
    </div>
  );
}
