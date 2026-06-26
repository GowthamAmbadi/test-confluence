import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { addAttendeeNote, fetchAttendeeProfile, resendAttendeeConfirmationEmail } from '../lib/api';
import type { AttendeeProfile, ProfilePermissions } from '../lib/attendeeProfile';
import type { NoteCategory } from '../lib/noteCategories';
import { formatINR, formatWhen } from '../lib/profileFormat';
import { AddNoteModal } from '../components/profile/AddNoteModal';
import { AttendeeAvatar } from '../components/profile/AttendeeAvatar';
import { AttendeeWorkspace } from '../components/profile/AttendeeWorkspace';
import { CollapsibleCard } from '../components/profile/CollapsibleCard';
import { ProfileQuickActions } from '../components/profile/ProfileQuickActions';
import {
  CheckInStatusBadge,
  PaymentStatusBadge,
  RegistrationStatusBadge,
} from '../components/StatusBadge';

function registrationsBackPath(returnSearch?: string): string {
  return returnSearch ? `/registrations?${returnSearch}` : '/registrations';
}

export function AttendeeProfilePage() {
  const { registrationId } = useParams<{ registrationId: string }>();
  const location = useLocation();
  const returnSearch = (location.state as { returnSearch?: string } | null)?.returnSearch;

  const [profile, setProfile] = useState<AttendeeProfile | null>(null);
  const [permissions, setPermissions] = useState<ProfilePermissions>({
    can_add_note: false,
    can_resend_email: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [noteOpen, setNoteOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);
  const [resending, setResending] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!registrationId) return;
    const data = await fetchAttendeeProfile(registrationId);
    setProfile(data.profile);
    setPermissions(data.permissions);
  }, [registrationId]);

  useEffect(() => {
    if (!registrationId) return;
    (async () => {
      try {
        await loadProfile();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, [registrationId, loadProfile]);

  const handleAddNote = async (note: string, category: NoteCategory) => {
    if (!registrationId) return;
    setSubmittingNote(true);
    setActionError('');
    try {
      await addAttendeeNote(registrationId, note, category);
      setNoteOpen(false);
      setActionSuccess('Note added.');
      await loadProfile();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleResendEmail = async () => {
    if (!registrationId) return;
    setResending(true);
    setActionError('');
    setActionSuccess('');
    try {
      await resendAttendeeConfirmationEmail(registrationId);
      setActionSuccess('Confirmation email sent.');
      await loadProfile();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to resend email');
    } finally {
      setResending(false);
    }
  };

  if (loading) {
    return (
      <div className="page-panel profile-page">
        <p>Loading attendee profile…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page-panel profile-page">
        <p><Link to={registrationsBackPath(returnSearch)}>← Back to registrations</Link></p>
        <p className="banner banner-error">{error || 'Registration not found'}</p>
      </div>
    );
  }

  const { snapshot } = profile;

  return (
    <div className="page-panel profile-page">
      <p>
        <Link to={registrationsBackPath(returnSearch)}>← Back to registrations</Link>
        {' · '}
        <Link to={`/support/${registrationId}`}>Open in Support Desk</Link>
      </p>

      {actionError && <p className="banner banner-error">{actionError}</p>}
      {actionSuccess && <p className="banner banner-success">{actionSuccess}</p>}

      <header className="page-header">
        <p className="page-eyebrow">Attendee Profile</p>
        <h2>{snapshot.full_name}</h2>
        <p className="page-sub">{snapshot.registration_reference || 'Pending reference'}</p>
      </header>

      <section className="profile-snapshot">
        <AttendeeAvatar name={snapshot.full_name} />
        <div className="profile-snapshot-main">
          <div className="profile-snapshot-badges">
            <PaymentStatusBadge status={snapshot.payment_status} />
            <CheckInStatusBadge status={snapshot.check_in_status} />
            <RegistrationStatusBadge status={snapshot.registration_status} />
          </div>
        </div>
        <dl className="profile-snapshot-stats">
          <div>
            <dt>Purchased Pass</dt>
            <dd>{snapshot.purchased_pass}</dd>
          </div>
          <div>
            <dt>Amount Paid</dt>
            <dd>{formatINR(Number(snapshot.amount_paid), profile.payment.currency)}</dd>
          </div>
          <div>
            <dt>Registration Date</dt>
            <dd>{formatWhen(snapshot.registration_date)}</dd>
          </div>
          <div>
            <dt>Last Updated</dt>
            <dd>{formatWhen(snapshot.last_updated)}</dd>
          </div>
        </dl>
      </section>

      <div className="profile-top-grid">
        <ProfileQuickActions
          permissions={permissions}
          registrationReference={snapshot.registration_reference}
          onResendEmail={() => void handleResendEmail()}
          onAddNote={() => setNoteOpen(true)}
          resending={resending}
        />
      </div>

      <div className="profile-layout">
        <div className="profile-column">
          <AttendeeWorkspace profile={profile} variant="profile" />
        </div>
        <div className="profile-column">
          <CollapsibleCard title="Technical Details" defaultOpen={false}>
            <dl className="detail-dl detail-dl-mono">
              <div><dt>Registration UUID</dt><dd>{profile.technical.registration_uuid}</dd></div>
              <div><dt>Razorpay Order ID</dt><dd>{profile.technical.razorpay_order_id || '—'}</dd></div>
              <div><dt>Razorpay Payment ID</dt><dd>{profile.technical.razorpay_payment_id || '—'}</dd></div>
              <div><dt>Order ID</dt><dd>{profile.technical.order_id || '—'}</dd></div>
              <div><dt>Payment ID</dt><dd>{profile.technical.payment_id || '—'}</dd></div>
            </dl>
          </CollapsibleCard>
        </div>
      </div>

      <AddNoteModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        onSubmit={handleAddNote}
        submitting={submittingNote}
      />
    </div>
  );
}
