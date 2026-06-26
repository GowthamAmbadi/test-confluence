import type { OperationsFilters } from './operations';

const STORAGE_KEY = 'confluence_admin_operations_saved_filters';

export interface SavedFilterPreset {
  id: string;
  name: string;
  filters: OperationsFilters;
  saved_at: string;
}

export function loadSavedFilters(): SavedFilterPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedFilterPreset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFilterPreset(name: string, filters: OperationsFilters): SavedFilterPreset[] {
  const presets = loadSavedFilters();
  const next: SavedFilterPreset = {
    id: crypto.randomUUID(),
    name: name.trim(),
    filters,
    saved_at: new Date().toISOString(),
  };
  const updated = [next, ...presets].slice(0, 12);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function deleteFilterPreset(id: string): SavedFilterPreset[] {
  const updated = loadSavedFilters().filter((p) => p.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}
