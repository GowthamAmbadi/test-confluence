import { FormEvent, useEffect, useState } from 'react';
import {
  createTeamMember,
  listTeamMembers,
  resetTeamMemberPassword,
  updateTeamMember,
  type TeamMember,
} from '../lib/api';
import { ADMIN_ROLES, ROLE_LABELS, type AdminRole } from '../lib/permissions';

export function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('CHECKIN_STAFF');
  const [password, setPassword] = useState('');
  const [useInvite, setUseInvite] = useState(true);

  async function loadMembers() {
    setLoading(true);
    setError('');
    try {
      const data = await listTeamMembers();
      setMembers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMembers();
  }, []);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');

    try {
      const result = await createTeamMember({
        full_name: fullName.trim(),
        email: email.trim(),
        role,
        password: useInvite ? undefined : password,
      });
      setMessage(
        result.invite_sent
          ? `Invite sent to ${result.member.email}.`
          : `Account created for ${result.member.email}.`,
      );
      setFullName('');
      setEmail('');
      setPassword('');
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff account');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(member: TeamMember) {
    setError('');
    setMessage('');
    try {
      await updateTeamMember({ id: member.id, is_active: !member.is_active });
      setMessage(`${member.full_name} is now ${member.is_active ? 'deactivated' : 'active'}.`);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account');
    }
  }

  async function changeRole(member: TeamMember, nextRole: AdminRole) {
    setError('');
    setMessage('');
    try {
      await updateTeamMember({ id: member.id, role: nextRole });
      setMessage(`Role updated for ${member.full_name}.`);
      await loadMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  }

  async function sendPasswordReset(member: TeamMember) {
    setError('');
    setMessage('');
    try {
      await resetTeamMemberPassword(member.id);
      setMessage(`Password reset email sent to ${member.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    }
  }

  return (
    <div className="page-panel">
      <header className="page-header">
        <p className="page-eyebrow">Super Admin</p>
        <h2>Team management</h2>
        <p className="page-sub">Create staff accounts, assign roles, deactivate access, and trigger password resets.</p>
      </header>

      {message && <p className="banner banner-success">{message}</p>}
      {error && <p className="banner banner-error">{error}</p>}

      <section className="panel-section">
        <h3>Create staff account</h3>
        <form onSubmit={handleCreate} className="team-form">
          <label>
            Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={useInvite}
              onChange={(e) => setUseInvite(e.target.checked)}
            />
            Send email invite (recommended)
          </label>
          {!useInvite && (
            <label>
              Temporary password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </label>
          )}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </section>

      <section className="panel-section">
        <h3>Team members</h3>
        {loading ? (
          <p>Loading team…</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>{member.full_name}</td>
                    <td>{member.email}</td>
                    <td>
                      <select
                        value={member.role}
                        onChange={(e) => changeRole(member, e.target.value as AdminRole)}
                      >
                        {ADMIN_ROLES.map((r) => (
                          <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <span className={member.is_active ? 'status-pill active' : 'status-pill inactive'}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      {member.last_login_at
                        ? new Date(member.last_login_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                        : '—'}
                    </td>
                    <td className="table-actions">
                      <button type="button" className="btn btn-small" onClick={() => toggleActive(member)}>
                        {member.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => sendPasswordReset(member)}>
                        Reset password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
