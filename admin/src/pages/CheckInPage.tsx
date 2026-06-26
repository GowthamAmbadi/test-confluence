import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { fetchCheckInStats, performCheckIn, searchCheckInAttendees } from '../lib/api';
import type {
  CheckInConfirmation,
  CheckInSearchResult,
  CheckInStats,
  CheckInValidationState,
} from '../lib/checkin';
import { VALIDATION_LABELS, validationStateForResult } from '../lib/checkin';
import { getDeviceLabel } from '../lib/device';
import { CheckInStatusBadge, PaymentStatusBadge } from '../components/StatusBadge';

const POLL_MS = 30_000;
const SUCCESS_MS = 2_000;
const SEARCH_DEBOUNCE_MS = 250;

function formatWhen(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function ValidationBanner({ state }: { state: CheckInValidationState }) {
  return (
    <div className={`checkin-validation checkin-validation--${state}`} role="status">
      {VALIDATION_LABELS[state]}
    </div>
  );
}

function SuccessBanner({ confirmation }: { confirmation: CheckInConfirmation }) {
  return (
    <div className="checkin-success" role="status" aria-live="polite">
      <p className="checkin-success-title">Checked In Successfully</p>
      <p><strong>{confirmation.attendee_name}</strong></p>
      <p>{confirmation.purchased_pass}</p>
      <p className="checkin-success-meta">
        {formatWhen(confirmation.checked_in_at)} · {confirmation.checked_in_by}
      </p>
    </div>
  );
}

function ResultCard({
  result,
  selected,
  onSelect,
}: {
  result: CheckInSearchResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const state = validationStateForResult(result);

  return (
    <button
      type="button"
      className={`checkin-result-card ${selected ? 'checkin-result-card--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="checkin-result-top">
        <strong>{result.full_name}</strong>
        <span className="checkin-result-ref">{result.registration_reference || 'No reference'}</span>
      </div>
      <p className="checkin-result-pass">{result.purchased_pass}</p>
      <div className="checkin-result-badges">
        <PaymentStatusBadge status={result.payment_status} />
        <CheckInStatusBadge status={result.check_in_status} />
      </div>
      <p className="checkin-result-date">Registered {formatWhen(result.registered_date)}</p>
      <ValidationBanner state={state} />
    </button>
  );
}

export function CheckInPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CheckInSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [canCheckIn, setCanCheckIn] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState<CheckInConfirmation | null>(null);
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);

  const selected = results[selectedIndex] ?? null;
  const selectedState = selected ? validationStateForResult(selected) : null;

  const focusSearch = useCallback(() => {
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }, []);

  const resetWorkflow = useCallback(() => {
    setQuery('');
    setResults([]);
    setSelectedIndex(0);
    setActionError('');
    setNotes('');
    setShowNotes(false);
    focusSearch();
  }, [focusSearch]);

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchCheckInStats();
      setStats(data);
      setCanCheckIn(data.permissions.can_check_in);
    } catch {
      // Keep desk usable if stats poll fails.
    }
  }, []);

  useEffect(() => {
    loadStats();
    const timer = window.setInterval(loadStats, POLL_MS);
    focusSearch();
    return () => window.clearInterval(timer);
  }, [loadStats, focusSearch]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      setActionError('');
      try {
        const data = await searchCheckInAttendees(trimmed);
        setResults(data.results);
        setCanCheckIn(data.permissions.can_check_in);
        setSelectedIndex(0);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => {
      setSuccess(null);
      resetWorkflow();
    }, SUCCESS_MS);
    return () => window.clearTimeout(timer);
  }, [success, resetWorkflow]);

  const handleCheckIn = async (target: CheckInSearchResult) => {
    if (!canCheckIn || !target.can_check_in) return;

    setCheckingIn(true);
    setActionError('');
    try {
      const deviceLabel = getDeviceLabel();
      const deviceInfo = `${deviceLabel} · ${navigator.userAgent.slice(0, 120)}`;
      const response = await performCheckIn({
        registration_id: target.registration_id,
        notes: notes.trim() || undefined,
        device_information: deviceInfo,
      });
      setSuccess(response.confirmation);
      await loadStats();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Check-in failed');
      focusSearch();
    } finally {
      setCheckingIn(false);
    }
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && results.length > 0) {
      event.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp' && results.length > 0) {
      event.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (selected && selected.can_check_in && canCheckIn) {
        void handleCheckIn(selected);
      } else if (results.length === 1 && results[0].can_check_in && canCheckIn) {
        void handleCheckIn(results[0]);
      }
    }
    if (event.key === 'Escape') {
      resetWorkflow();
    }
  };

  return (
    <div className="page-panel checkin-page">
      <header className="checkin-header">
        <div>
          <p className="page-eyebrow">Volunteer Desk</p>
          <h2>Event Check-In</h2>
        </div>
        {stats && (
          <div className="checkin-stats" aria-live="polite">
            <div className="checkin-stat">
              <span className="checkin-stat-label">Today</span>
              <strong>{stats.today_check_ins}</strong>
            </div>
            <div className="checkin-stat">
              <span className="checkin-stat-label">Total</span>
              <strong>{stats.total_check_ins}</strong>
            </div>
            <div className="checkin-stat">
              <span className="checkin-stat-label">Pending</span>
              <strong>{stats.pending_check_ins}</strong>
            </div>
          </div>
        )}
      </header>

      {success && <SuccessBanner confirmation={success} />}

      {!success && (
        <>
          <label className="checkin-search-label" htmlFor="checkin-search">
            Search attendee
          </label>
          <input
            id="checkin-search"
            ref={searchRef}
            className="checkin-search-input"
            type="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Registration reference, name, phone, or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
          />
          <p className="checkin-search-hint">
            Type to search · ↑↓ to select · Enter to check in · Esc to clear
          </p>

          {actionError && <p className="banner banner-error">{actionError}</p>}

          {searching && <p className="muted">Searching…</p>}

          {results.length > 0 && (
            <div className="checkin-results" role="listbox" aria-label="Search results">
              {results.map((result, index) => (
                <ResultCard
                  key={result.registration_id}
                  result={result}
                  selected={index === selectedIndex}
                  onSelect={() => {
                    setSelectedIndex(index);
                    if (result.can_check_in && canCheckIn) {
                      void handleCheckIn(result);
                    }
                  }}
                />
              ))}
            </div>
          )}

          {selected && !success && (
            <section className="checkin-action-panel">
              <h3>{selected.full_name}</h3>
              {selectedState && <ValidationBanner state={selectedState} />}

              {selectedState === 'already_checked_in' && (
                <p className="checkin-detail">
                  Checked by {selected.checked_in_by || '—'} at {formatWhen(selected.checked_in_at)}
                </p>
              )}

              {canCheckIn && selected.can_check_in && (
                <>
                  <button
                    type="button"
                    className="btn btn-small checkin-notes-toggle"
                    onClick={() => setShowNotes((value) => !value)}
                  >
                    {showNotes ? 'Hide notes' : 'Add optional note'}
                  </button>
                  {showNotes && (
                    <label className="checkin-notes-field">
                      Check-in note
                      <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional"
                      />
                    </label>
                  )}
                  <button
                    type="button"
                    className="btn btn-primary checkin-action-btn"
                    disabled={checkingIn}
                    onClick={() => void handleCheckIn(selected)}
                  >
                    {checkingIn ? 'Checking In…' : 'Check In'}
                  </button>
                </>
              )}

              {!canCheckIn && (
                <p className="muted">Read-only access — you cannot perform check-ins.</p>
              )}
            </section>
          )}
        </>
      )}

      {stats && stats.recent.length > 0 && (
        <section className="checkin-history">
          <h3>Recent Check-Ins</h3>
          <div className="table-wrap">
            <table className="data-table checkin-history-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Attendee</th>
                  <th>Pass</th>
                  <th>Volunteer</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((row, index) => (
                  <tr key={`${row.checked_in_at}-${row.attendee_name}-${index}`}>
                    <td>{formatWhen(row.checked_in_at)}</td>
                    <td>{row.attendee_name}</td>
                    <td>{row.pass}</td>
                    <td>{row.volunteer_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
