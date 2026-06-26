import { useState } from 'react';
import type { FilterOptions, OperationsFilters } from '../../lib/operations';
import {
  deleteFilterPreset,
  loadSavedFilters,
  saveFilterPreset,
  type SavedFilterPreset,
} from '../../lib/savedFilters';

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 Days' },
  { value: 'last_30', label: 'Last 30 Days' },
  { value: 'custom', label: 'Custom Range' },
];

interface Props {
  filters: OperationsFilters;
  options: FilterOptions | null;
  onChange: (patch: Partial<OperationsFilters>) => void;
  onLoadPreset?: (filters: OperationsFilters) => void;
  showVolunteer?: boolean;
  showActivityTypes?: boolean;
  activityTypes?: string[];
  onActivityTypesChange?: (types: string[]) => void;
}

export function OperationsFilterBar({
  filters,
  options,
  onChange,
  onLoadPreset,
  showVolunteer,
  showActivityTypes,
  activityTypes = [],
  onActivityTypesChange,
}: Props) {
  const [saved, setSaved] = useState<SavedFilterPreset[]>(loadSavedFilters);
  const [presetName, setPresetName] = useState('');

  const handleSavePreset = () => {
    if (!presetName.trim()) return;
    setSaved(saveFilterPreset(presetName, filters));
    setPresetName('');
  };

  return (
    <div className="ops-filter-bar">
      <div className="ops-filter-row">
        <label>
          Date
          <select
            value={filters.date_preset ?? 'last_7'}
            onChange={(e) => onChange({ date_preset: e.target.value as OperationsFilters['date_preset'] })}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        {filters.date_preset === 'custom' && (
          <>
            <label>
              From
              <input type="date" value={filters.date_from ?? ''} onChange={(e) => onChange({ date_from: e.target.value })} />
            </label>
            <label>
              To
              <input type="date" value={filters.date_to ?? ''} onChange={(e) => onChange({ date_to: e.target.value })} />
            </label>
          </>
        )}

        <label>
          Event / Pass
          <select value={filters.event_id ?? ''} onChange={(e) => onChange({ event_id: e.target.value || undefined })}>
            <option value="">All passes</option>
            {options?.events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </label>

        <label>
          Payment
          <select value={filters.payment_status ?? ''} onChange={(e) => onChange({ payment_status: e.target.value || undefined })}>
            <option value="">All</option>
            <option value="complete">Complete</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <label>
          Registration
          <select value={filters.registration_status ?? ''} onChange={(e) => onChange({ registration_status: e.target.value || undefined })}>
            <option value="">All</option>
            <option value="PAYMENT_COMPLETE">Payment Complete</option>
            <option value="PAYMENT_PENDING">Payment Pending</option>
          </select>
        </label>

        <label>
          Check-In
          <select value={filters.check_in_status ?? ''} onChange={(e) => onChange({ check_in_status: e.target.value || undefined })}>
            <option value="">All</option>
            <option value="checked_in">Checked In</option>
            <option value="not_checked_in">Not Checked In</option>
          </select>
        </label>

        {showVolunteer && (
          <label>
            Volunteer
            <select value={filters.volunteer_id ?? ''} onChange={(e) => onChange({ volunteer_id: e.target.value || undefined })}>
              <option value="">All volunteers</option>
              {options?.volunteers.map((v) => (
                <option key={v.id} value={v.id}>{v.full_name}</option>
              ))}
            </select>
          </label>
        )}

        <label className="ops-search-label">
          Search
          <input
            type="search"
            placeholder="Name, email, ref…"
            value={filters.q ?? ''}
            onChange={(e) => onChange({ q: e.target.value || undefined })}
          />
        </label>
      </div>

      <div className="ops-filter-row ops-filter-secondary">
        <label>
          Saved filters
          <select
            value=""
            onChange={(e) => {
              const preset = saved.find((p) => p.id === e.target.value);
              if (preset) {
                if (onLoadPreset) onLoadPreset(preset.filters);
                else onChange(preset.filters);
              }
            }}
          >
            <option value="">Load preset…</option>
            {saved.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        <label>
          Save as
          <input
            type="text"
            placeholder="Preset name"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
          />
        </label>
        <button type="button" className="btn btn-secondary" onClick={handleSavePreset}>Save</button>
        {saved.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const id = saved[0]?.id;
              if (id) setSaved(deleteFilterPreset(id));
            }}
          >
            Delete latest
          </button>
        )}
      </div>

      {showActivityTypes && onActivityTypesChange && (
        <div className="ops-activity-types">
          <span>Event types:</span>
          {['REGISTRATION_CREATED', 'PAYMENT_CAPTURED', 'EMAIL_SENT', 'EMAIL_FAILED', 'ADMIN_NOTE_ADDED', 'CHECKED_IN', 'ADMIN_LOGIN', 'ADMIN_PASSWORD_RESET'].map((type) => (
            <label key={type} className="ops-chip">
              <input
                type="checkbox"
                checked={activityTypes.includes(type)}
                onChange={(e) => {
                  if (e.target.checked) onActivityTypesChange([...activityTypes, type]);
                  else onActivityTypesChange(activityTypes.filter((t) => t !== type));
                }}
              />
              {type.replace(/_/g, ' ')}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
