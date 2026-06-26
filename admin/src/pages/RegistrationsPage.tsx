import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchRecentSearches, recordRecentSearch, searchRegistrations } from '../lib/api';
import type { PassOption, RegistrationListItem, RegistrationQuery, RecentSearch } from '../lib/registrations';
import { CheckInStatusBadge, PaymentStatusBadge } from '../components/StatusBadge';

const PAGE_SIZES = [25, 50, 100];

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function queryFromParams(params: URLSearchParams): RegistrationQuery {
  return {
    q: params.get('q') || undefined,
    payment_status: params.get('payment_status') || undefined,
    registration_status: params.get('registration_status') || undefined,
    check_in_status: params.get('check_in_status') || undefined,
    event_id: params.get('event_id') || undefined,
    date_preset: params.get('date_preset') || undefined,
    date_from: params.get('date_from') || undefined,
    date_to: params.get('date_to') || undefined,
    sort: params.get('sort') || 'created_at',
    sort_dir: (params.get('sort_dir') as 'asc' | 'desc') || 'desc',
    page: Number(params.get('page') || 1),
    page_size: Number(params.get('page_size') || 25),
  };
}

export function RegistrationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<RegistrationListItem[]>([]);
  const [passes, setPasses] = useState<PassOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [searchInput, setSearchInput] = useState(searchParams.get('q') || '');

  const query = queryFromParams(searchParams);

  const updateParams = useCallback((patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await searchRegistrations(query);
      setItems(result.items);
      setPasses(result.passes);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchRecentSearches().then(setRecentSearches).catch(() => {});
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const trimmed = searchInput.trim();
      if (trimmed !== (searchParams.get('q') || '')) {
        updateParams({ q: trimmed || undefined, page: '1' });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, searchParams, updateParams]);

  useEffect(() => {
    const q = searchParams.get('q')?.trim();
    if (!q) return;
    const timer = window.setTimeout(() => {
      recordRecentSearch(q).then(setRecentSearches).catch(() => {});
    }, 800);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const totalPages = Math.max(1, Math.ceil(total / (query.page_size || 25)));

  return (
    <div className="page-panel registrations-page">
      <header className="page-header">
        <p className="page-eyebrow">Attendee Lookup</p>
        <h2>Registrations</h2>
      </header>

      <div className="reg-search-bar">
        <input
          type="search"
          className="reg-search-input"
          placeholder="Search reference, name, email, phone, college, city…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>

      {recentSearches.length > 0 && (
        <div className="recent-searches">
          <span>Recent:</span>
          {recentSearches.map((item) => (
            <button
              key={`${item.search_text}-${item.searched_at}`}
              type="button"
              className="recent-chip"
              onClick={() => setSearchInput(item.search_text)}
            >
              {item.search_text}
            </button>
          ))}
        </div>
      )}

      <div className="reg-filters panel-section">
        <label>
          Payment
          <select
            value={query.payment_status || ''}
            onChange={(e) => updateParams({ payment_status: e.target.value || undefined, page: '1' })}
          >
            <option value="">All</option>
            <option value="complete">Payment Complete</option>
            <option value="pending">Payment Pending</option>
            <option value="failed">Payment Failed</option>
          </select>
        </label>
        <label>
          Registration
          <select
            value={query.registration_status || ''}
            onChange={(e) => updateParams({ registration_status: e.target.value || undefined, page: '1' })}
          >
            <option value="">All</option>
            <option value="PAYMENT_COMPLETE">Registered (Paid)</option>
            <option value="PAYMENT_PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </label>
        <label>
          Check-In
          <select
            value={query.check_in_status || ''}
            onChange={(e) => updateParams({ check_in_status: e.target.value || undefined, page: '1' })}
          >
            <option value="">All</option>
            <option value="checked_in">Checked In</option>
            <option value="not_checked_in">Not Checked In</option>
          </select>
        </label>
        <label>
          Pass
          <select
            value={query.event_id || ''}
            onChange={(e) => updateParams({ event_id: e.target.value || undefined, page: '1' })}
          >
            <option value="">All passes</option>
            {passes.map((pass) => (
              <option key={pass.id} value={pass.id}>{pass.name}</option>
            ))}
          </select>
        </label>
        <label>
          Date
          <select
            value={query.date_preset || ''}
            onChange={(e) => updateParams({
              date_preset: e.target.value || undefined,
              date_from: undefined,
              date_to: undefined,
              page: '1',
            })}
          >
            <option value="">All time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7">Last 7 days</option>
            <option value="last_30">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {query.date_preset === 'custom' && (
          <>
            <label>
              From
              <input
                type="date"
                value={query.date_from || ''}
                onChange={(e) => updateParams({ date_from: e.target.value || undefined, page: '1' })}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={query.date_to || ''}
                onChange={(e) => updateParams({ date_to: e.target.value || undefined, page: '1' })}
              />
            </label>
          </>
        )}
      </div>

      {error && <p className="banner banner-error">{error}</p>}

      <div className="table-wrap panel-section">
        <table className="data-table reg-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="th-sort" onClick={() => updateParams({
                  sort: 'registration_id',
                  sort_dir: query.sort === 'registration_id' && query.sort_dir === 'asc' ? 'desc' : 'asc',
                })}
                >
                  Reference
                </button>
              </th>
              <th>
                <button type="button" className="th-sort" onClick={() => updateParams({
                  sort: 'full_name',
                  sort_dir: query.sort === 'full_name' && query.sort_dir === 'asc' ? 'desc' : 'asc',
                })}
                >
                  Name
                </button>
              </th>
              <th>Email</th>
              <th>Phone</th>
              <th>College</th>
              <th>Pass</th>
              <th>
                <button type="button" className="th-sort" onClick={() => updateParams({
                  sort: 'amount_paid',
                  sort_dir: query.sort === 'amount_paid' && query.sort_dir === 'asc' ? 'desc' : 'asc',
                })}
                >
                  Paid
                </button>
              </th>
              <th>Payment</th>
              <th>Check-In</th>
              <th>
                <button type="button" className="th-sort" onClick={() => updateParams({
                  sort: 'created_at',
                  sort_dir: query.sort === 'created_at' && query.sort_dir === 'asc' ? 'desc' : 'asc',
                })}
                >
                  Registered
                </button>
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11}>Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={11}>No registrations found.</td></tr>
            ) : items.map((row) => (
              <tr key={row.id}>
                <td>{row.registration_reference || '—'}</td>
                <td>{row.full_name}</td>
                <td className="cell-email">{row.email}</td>
                <td>{row.phone}</td>
                <td>{row.college}</td>
                <td>{row.purchased_pass}</td>
                <td>{formatINR(Number(row.amount_paid))}</td>
                <td><PaymentStatusBadge status={row.payment_status} /></td>
                <td><CheckInStatusBadge status={row.check_in_status} /></td>
                <td>{formatWhen(row.created_at)}</td>
                <td>
                  <Link
                    to={`/registrations/${row.id}`}
                    state={{ returnSearch: searchParams.toString() }}
                    className="btn btn-small"
                  >
                    View Details
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-bar">
        <span>{total} total</span>
        <label>
          Per page
          <select
            value={String(query.page_size || 25)}
            onChange={(e) => updateParams({ page_size: e.target.value, page: '1' })}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn btn-small"
          disabled={(query.page || 1) <= 1}
          onClick={() => updateParams({ page: String((query.page || 1) - 1) })}
        >
          Prev
        </button>
        <span>Page {query.page || 1} / {totalPages}</span>
        <button
          type="button"
          className="btn btn-small"
          disabled={(query.page || 1) >= totalPages}
          onClick={() => updateParams({ page: String((query.page || 1) + 1) })}
        >
          Next
        </button>
      </div>
    </div>
  );
}
