import { FormEvent, useEffect, useState } from 'react';
import { createPromoCode, listPromoCodes, updatePromoCode } from '../lib/api';
import type { PromoCode, PromoCodeFormData, PromoEventOption } from '../lib/promoCodes';
import { formatPromoDiscount, formatPromoStatus } from '../lib/promoCodes';

function formatWhen(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

function toDatetimeLocal(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function emptyForm(): PromoCodeFormData {
  return {
    code: '',
    description: '',
    event_id: null,
    discount_type: 'percentage',
    discount_value: 10,
    valid_from: '',
    valid_until: '',
    max_uses: null,
    is_active: true,
  };
}

function PromoCodeModal({ mode, editingId, initial, events, onClose, onSaved }: {
  mode: 'create' | 'edit';
  editingId?: string;
  initial: PromoCodeFormData;
  events: PromoEventOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PromoCodeFormData>(initial);
  const [eventScope, setEventScope] = useState<'all' | 'specific'>(
    initial.event_id ? 'specific' : 'all',
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    if (eventScope === 'specific' && !form.event_id) {
      setError('Select an event or choose All Events.');
      setSaving(false);
      return;
    }

    try {
      const payload = {
        ...form,
        event_id: eventScope === 'all' ? null : form.event_id,
        description: form.description || undefined,
        valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : undefined,
        valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : undefined,
        max_uses: form.max_uses ?? undefined,
      };
      if (mode === 'create') {
        await createPromoCode(payload);
      } else if (editingId) {
        await updatePromoCode(editingId, payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-card promo-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="promo-modal-header">
          <h3>{mode === 'create' ? 'Create Promo Code' : 'Edit Promo Code'}</h3>
          <p className="muted">Set discount rules and optional event scope.</p>
        </div>
        <form onSubmit={handleSubmit} className="promo-modal-form">
          <div className="promo-modal-body promo-form-grid">
            {mode === 'create' && (
              <label className="promo-field-full">
                Code
                <input
                  value={form.code ?? ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  required
                  placeholder="EARLYBIRD"
                />
              </label>
            )}
            <label>
              Event scope
              <select
                value={eventScope}
                onChange={(e) => {
                  const next = e.target.value as 'all' | 'specific';
                  setEventScope(next);
                  if (next === 'all') setForm({ ...form, event_id: null });
                }}
              >
                <option value="all">All Events</option>
                <option value="specific">Specific Event</option>
              </select>
            </label>
            {eventScope === 'specific' ? (
              <label>
                Event
                <select
                  value={form.event_id ?? ''}
                  onChange={(e) => setForm({ ...form, event_id: e.target.value || null })}
                  required
                >
                  <option value="">Select event…</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>{event.name}</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="promo-field-hint muted">Applies to every pass at checkout.</div>
            )}
            <label className="promo-field-full">
              Description
              <input
                value={form.description ?? ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Early bird discount"
              />
            </label>
            <label>
              Discount type
              <select
                value={form.discount_type}
                onChange={(e) => setForm({ ...form, discount_type: e.target.value as PromoCodeFormData['discount_type'] })}
              >
                <option value="percentage">Percentage</option>
                <option value="fixed">Fixed amount (₹)</option>
              </select>
            </label>
            <label>
              Discount value
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={form.discount_type === 'percentage' ? 100 : undefined}
                value={form.discount_value}
                onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })}
                required
              />
            </label>
            <label>
              Valid from
              <input
                type="datetime-local"
                value={form.valid_from ?? ''}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
              />
            </label>
            <label>
              Valid until
              <input
                type="datetime-local"
                value={form.valid_until ?? ''}
                onChange={(e) => setForm({ ...form, valid_until: e.target.value })}
              />
            </label>
            <label>
              Maximum uses
              <input
                type="number"
                min="1"
                value={form.max_uses ?? ''}
                onChange={(e) => setForm({ ...form, max_uses: e.target.value ? Number(e.target.value) : null })}
                placeholder="Unlimited"
              />
            </label>
            <label className="checkbox-row promo-field-active">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              Active
            </label>
          </div>
          {error && <p className="banner banner-error promo-modal-error">{error}</p>}
          <div className="promo-modal-footer modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EventCell({ row }: { row: PromoCode }) {
  if (!row.event_id) {
    return <span className="ops-chip promo-all-events">All Events</span>;
  }
  return <span>{row.event_name ?? '—'}</span>;
}

export function PromoCodesPage() {
  const [rows, setRows] = useState<PromoCode[]>([]);
  const [events, setEvents] = useState<PromoEventOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; editingId?: string; form: PromoCodeFormData } | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await listPromoCodes();
      setRows(data.promo_codes);
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleActive(row: PromoCode) {
    setMessage('');
    setError('');
    try {
      await updatePromoCode(row.id, { is_active: !row.is_active });
      setMessage(`${row.code} is now ${row.is_active ? 'disabled' : 'enabled'}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  }

  function openEdit(row: PromoCode) {
    setModal({
      mode: 'edit',
      editingId: row.id,
      form: {
        description: row.description ?? '',
        event_id: row.event_id,
        discount_type: row.discount_type,
        discount_value: Number(row.discount_value),
        valid_from: toDatetimeLocal(row.valid_from),
        valid_until: toDatetimeLocal(row.valid_until),
        max_uses: row.max_uses,
        is_active: row.is_active,
      },
    });
  }

  return (
    <div className="page-panel">
      <header className="page-header">
        <p className="page-eyebrow">Super Admin</p>
        <h2>Promo Codes</h2>
        <p className="page-sub">Create global or event-specific promo codes for checkout.</p>
      </header>

      {message && <p className="banner banner-success">{message}</p>}
      {error && <p className="banner banner-error">{error}</p>}

      <div className="page-actions">
        <button type="button" className="btn btn-primary" onClick={() => setModal({ mode: 'create', form: emptyForm() })}>
          Create Promo Code
        </button>
      </div>

      {loading ? (
        <p>Loading promo codes…</p>
      ) : (
        <section className="panel-section">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Event</th>
                <th>Description</th>
                <th>Discount</th>
                <th>Status</th>
                <th>Used</th>
                <th>Valid Until</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.code}</strong></td>
                  <td><EventCell row={row} /></td>
                  <td>{row.description || '—'}</td>
                  <td>{formatPromoDiscount(row)}</td>
                  <td>{formatPromoStatus(row)}</td>
                  <td>{row.used_count}{row.max_uses != null ? ` / ${row.max_uses}` : ''}</td>
                  <td>{formatWhen(row.valid_until)}</td>
                  <td className="table-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => openEdit(row)}>Edit</button>
                    <button type="button" className="btn btn-ghost" onClick={() => toggleActive(row)}>
                      {row.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="muted">No promo codes yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {modal && (
        <PromoCodeModal
          mode={modal.mode}
          editingId={modal.editingId}
          initial={modal.form}
          events={events}
          onClose={() => setModal(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
