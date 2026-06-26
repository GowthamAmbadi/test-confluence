const STORAGE_KEY = 'confluence_support_recent';
const MAX_RECENT = 8;

export interface RecentAttendee {
  registration_id: string;
  full_name: string;
  registration_reference: string | null;
  opened_at: string;
}

export function loadRecentAttendees(): RecentAttendee[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentAttendee[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordRecentAttendee(entry: Omit<RecentAttendee, 'opened_at'>): RecentAttendee[] {
  const opened: RecentAttendee = { ...entry, opened_at: new Date().toISOString() };
  const existing = loadRecentAttendees().filter((item) => item.registration_id !== entry.registration_id);
  const next = [opened, ...existing].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
