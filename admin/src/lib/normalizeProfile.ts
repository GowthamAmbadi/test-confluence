import type { AttendeeProfile, CommunicationDetails, SupportExtensions } from './attendeeProfile';

const DEFAULT_COMMUNICATION: CommunicationDetails = {
  delivery_status: 'unknown',
  last_email_sent_at: null,
  last_resend_at: null,
  resend_count: 0,
  last_email_failed_at: null,
  last_failure_reason: null,
};

const DEFAULT_EXTENSIONS: SupportExtensions = {
  tickets_enabled: false,
  escalations_enabled: false,
  assignments_enabled: false,
  priorities_enabled: false,
  tag_management_enabled: false,
};

export function normalizeAttendeeProfile(profile: AttendeeProfile): AttendeeProfile {
  return {
    ...profile,
    communication: profile.communication ?? DEFAULT_COMMUNICATION,
    tags: profile.tags ?? [],
    support_extensions: profile.support_extensions ?? DEFAULT_EXTENSIONS,
    internal_notes: (profile.internal_notes ?? []).map((note) => ({
      ...note,
      category: note.category ?? 'General',
    })),
  };
}
