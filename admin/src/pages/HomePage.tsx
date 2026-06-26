import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, PERMISSION_MATRIX } from '../lib/permissions';

export function HomePage() {
  const { profile } = useAuth();

  if (!profile) return null;

  const activePermissions = Object.entries(PERMISSION_MATRIX)
    .filter(([, roles]) => roles[profile.role])
    .map(([key]) => key.replaceAll('_', ' '));

  return (
    <div className="page-panel">
      <header className="page-header">
        <p className="page-eyebrow">Module 1 complete</p>
        <h2>Welcome, {profile.full_name}</h2>
        <p className="page-sub">
          Authentication and team management are active. Dashboard, registrations, and check-in modules will build on this foundation.
        </p>
      </header>

      <div className="info-grid">
        <article className="info-card">
          <h3>Your role</h3>
          <p className="info-value">{ROLE_LABELS[profile.role]}</p>
        </article>
        <article className="info-card">
          <h3>Account status</h3>
          <p className="info-value">{profile.is_active ? 'Active' : 'Inactive'}</p>
        </article>
        <article className="info-card">
          <h3>Last login</h3>
          <p className="info-value">
            {profile.last_login_at
              ? new Date(profile.last_login_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
              : 'First session'}
          </p>
        </article>
      </div>

      <section className="panel-section">
        <h3>Your permissions (Module 1)</h3>
        <ul className="permission-list">
          {activePermissions.map((permission) => (
            <li key={permission}>{permission}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
