import {
  useCallback,
  useEffect,
  useState,
} from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  addAttendeeNote,
  fetchAttendeeProfile,
  fetchRecentSearches,
  recordRecentSearch,
  resendAttendeeConfirmationEmail,
  searchRegistrations,
} from '../lib/api';
import type { AttendeeProfile, ProfilePermissions } from '../lib/attendeeProfile';
import type { NoteCategory } from '../lib/noteCategories';
import { formatWhen } from '../lib/profileFormat';
import type { RegistrationListItem } from '../lib/registrations';
import {
  loadRecentAttendees,
  recordRecentAttendee,
  type RecentAttendee,
} from '../lib/supportRecent';
import { AddNoteModal } from '../components/profile/AddNoteModal';
import { AttendeeAvatar } from '../components/profile/AttendeeAvatar';
import { AttendeeWorkspace } from '../components/profile/AttendeeWorkspace';
import { SupportQuickActions } from '../components/support/SupportQuickActions';
import { CheckInStatusBadge, PaymentStatusBadge } from '../components/StatusBadge';

const SEARCH_DEBOUNCE_MS = 300;

export function SupportDeskPage() {
  const { registrationId: routeId } = useParams<{ registrationId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [results, setResults] = useState<RegistrationListItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [recentAttendees, setRecentAttendees] = useState<RecentAttendee[]>(() => loadRecentAttendees());

  const selectedId = routeId || null;
  const [profile, setProfile] = useState<AttendeeProfile | null>(null);
  const [permissions, setPermissions] = useState<ProfilePermissions>({
    can_add_note: false,
    can_resend_email: false,
  });
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [resending, setResending] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const loadWorkspace = useCallback(async (id: string) => {
    setWorkspaceLoading(true);
    setWorkspaceError('');
    try {
      const data = await fetchAttendeeProfile(id);
      setProfile(data.profile);
      setPermissions(data.permissions);
      const recent = recordRecentAttendee({
        registration_id: id,
        full_name: data.profile.snapshot.full_name,
        registration_reference: data.profile.snapshot.registration_reference,
      });
      setRecentAttendees(recent);
    } catch (err) {
      setWorkspaceError(err instanceof Error ? err.message : 'Failed to load attendee');
      setProfile(null);
    } finally {
      setWorkspaceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setProfile(null);
      return;
    }
    void loadWorkspace(selectedId);
  }, [selectedId, loadWorkspace]);

  useEffect(() => {
    fetchRecentSearches()
      .then((items) => setRecentSearches(items.map((item) => item.search_text)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const timer = window.setTimeout(async () => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      setSearchError('');
      try {
        const data = await searchRegistrations({ q: trimmed, page_size: 10, page: 1 });
        setResults(data.items);
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query]);

  const selectAttendee = (id: string) => {
    navigate(`/support/${id}${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
  };

  const handleSearchSubmit = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const next = new URLSearchParams(searchParams);
    next.set('q', trimmed);
    setSearchParams(next);
    try {
      const updated = await recordRecentSearch(trimmed);
      setRecentSearches(updated.map((item) => item.search_text));
    } catch {
      // Non-blocking.
    }
  };

  const handleAddNote = async (note: string, category: NoteCategory) => {
    if (!selectedId) return;
    setSubmittingNote(true);
    setActionError('');
    try {
      await addAttendeeNote(selectedId, note, category);
      setNoteOpen(false);
      setActionMessage('Note added.');
      await loadWorkspace(selectedId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleResendEmail = async () => {
    if (!selectedId) return;
    setResending(true);
    setActionError('');
    setActionMessage('');
    try {
      await resendAttendeeConfirmationEmail(selectedId);
      setActionMessage('Confirmation email sent.');
      await loadWorkspace(selectedId);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to resend email');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="page-panel support-page">
      <header className="page-header">
        <p className="page-eyebrow">Customer Support</p>
        <h2>Support Desk</h2>
      </header>

      <div className="support-layout">
        <aside className="support-search-panel">
          <label className="checkin-search-label" htmlFor="support-search">Find attendee</label>
          <input
            id="support-search"
            className="checkin-search-input"
            type="search"
            placeholder="Name, email, phone, or registration reference"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSearchSubmit();
            }}
          />

          {recentSearches.length > 0 && (
            <div className="recent-searches">
              <span className="muted">Recent:</span>
              {recentSearches.map((text) => (
                <button
                  key={text}
                  type="button"
                  className="recent-chip"
                  onClick={() => setQuery(text)}
                >
                  {text}
                </button>
              ))}
            </div>
          )}

          {recentAttendees.length > 0 && (
            <div className="support-recent-attendees">
              <p className="muted">Recently opened</p>
              <ul className="support-recent-list">
                {recentAttendees.map((item) => (
                  <li key={item.registration_id}>
                    <button
                      type="button"
                      className={`support-recent-btn ${selectedId === item.registration_id ? 'support-recent-btn--active' : ''}`}
                      onClick={() => selectAttendee(item.registration_id)}
                    >
                      <strong>{item.full_name}</strong>
                      <span>{item.registration_reference || 'No reference'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {searchError && <p className="banner banner-error">{searchError}</p>}
          {searching && <p className="muted">Searching…</p>}

          <div className="support-results">
            {results.map((row) => (
              <button
                key={row.id}
                type="button"
                className={`support-result-row ${selectedId === row.id ? 'support-result-row--active' : ''}`}
                onClick={() => selectAttendee(row.id)}
              >
                <strong>{row.full_name}</strong>
                <span className="support-result-ref">{row.registration_reference || '—'}</span>
                <span className="support-result-pass">{row.purchased_pass}</span>
                <div className="support-result-badges">
                  <PaymentStatusBadge status={row.payment_status} />
                  <CheckInStatusBadge status={row.check_in_status} />
                </div>
                <span className="support-result-date">{formatWhen(row.created_at)}</span>
              </button>
            ))}
            {!searching && query.trim().length >= 2 && results.length === 0 && (
              <p className="muted">No registrations found.</p>
            )}
          </div>
        </aside>

        <section className="support-workspace">
          {!selectedId && (
            <div className="support-empty">
              <p>Search for an attendee or pick someone from recently opened.</p>
            </div>
          )}

          {selectedId && workspaceLoading && <p>Loading support workspace…</p>}
          {selectedId && workspaceError && <p className="banner banner-error">{workspaceError}</p>}

          {selectedId && profile && !workspaceLoading && (
            <>
              {actionError && <p className="banner banner-error">{actionError}</p>}
              {actionMessage && <p className="banner banner-success">{actionMessage}</p>}

              <header className="support-workspace-header">
                <AttendeeAvatar name={profile.snapshot.full_name} />
                <div>
                  <h3>{profile.snapshot.full_name}</h3>
                  <p className="profile-snapshot-ref">
                    {profile.snapshot.registration_reference || 'Pending reference'}
                  </p>
                  <Link to={`/registrations/${selectedId}`} className="support-profile-link">
                    Open full profile
                  </Link>
                </div>
              </header>

              <SupportQuickActions
                profile={profile}
                permissions={permissions}
                onResendEmail={() => void handleResendEmail()}
                onAddNote={() => setNoteOpen(true)}
                resending={resending}
              />

              <div className="support-workspace-sections">
                <AttendeeWorkspace profile={profile} variant="support" />
              </div>

              <AddNoteModal
                open={noteOpen}
                onClose={() => setNoteOpen(false)}
                onSubmit={handleAddNote}
                submitting={submittingNote}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
