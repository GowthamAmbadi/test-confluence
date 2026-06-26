export const NOTE_CATEGORIES = [
  'General',
  'Payment',
  'Registration',
  'Technical',
  'VIP',
  'Other',
] as const;

export type NoteCategory = (typeof NOTE_CATEGORIES)[number];
