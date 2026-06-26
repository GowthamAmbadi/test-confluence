import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS, canAccessRoute } from '../lib/permissions';

export function AdminLayout() {
  const { profile, signOut } = useAuth();

  if (!profile) return null;

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand-block">
          <p className="brand-eyebrow">YANC Confluence</p>
          <h1>Event Ops</h1>
        </div>

        <nav className="admin-nav">
          {profile.role === 'CHECKIN_STAFF' ? (
            <NavLink to="/check-in" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Check-In
            </NavLink>
          ) : profile.role === 'SUPPORT_DESK' ? (
            <NavLink to="/support" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Support
            </NavLink>
          ) : (
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              {profile.role === 'SUPER_ADMIN' ? 'Dashboard' : 'Home'}
            </NavLink>
          )}
          {canAccessRoute(profile.role, 'checkIn') && profile.role !== 'CHECKIN_STAFF' && (
            <NavLink to="/check-in" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Check-In
            </NavLink>
          )}
          {canAccessRoute(profile.role, 'support') && profile.role !== 'SUPPORT_DESK' && (
            <NavLink to="/support" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Support
            </NavLink>
          )}
          {canAccessRoute(profile.role, 'registrations') && (
            <NavLink to="/registrations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Registrations
            </NavLink>
          )}
          {canAccessRoute(profile.role, 'operations') && (
            <NavLink to="/operations" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Operations
            </NavLink>
          )}
          {canAccessRoute(profile.role, 'team') && (
            <NavLink to="/team" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Team
            </NavLink>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{profile.full_name}</strong>
            <span>{ROLE_LABELS[profile.role]}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
