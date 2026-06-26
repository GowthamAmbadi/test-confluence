import type { AttendeeProfile } from '../../lib/attendeeProfile';
import { formatWhen } from '../../lib/profileFormat';
import { CollapsibleCard } from './CollapsibleCard';
import { FormAnswerRenderer } from './FormAnswerRenderer';
import { ProfileAlerts } from './ProfileAlerts';
import { ProfileTimeline } from './ProfileTimeline';
import {
  CheckInStatusBadge,
  PaymentStatusBadge,
  RegistrationStatusBadge,
} from '../StatusBadge';

const DELIVERY_LABELS: Record<string, string> = {
  delivered: 'Delivered',
  failed: 'Failed',
  pending: 'Pending',
  not_applicable: 'Not Applicable',
  unknown: 'Unknown',
};

function CommunicationCard({ profile }: { profile: AttendeeProfile }) {
  const comm = profile.communication;
  if (!comm) return null;

  return (
    <CollapsibleCard title="Communication" defaultOpen>
      <dl className="detail-dl">
        <div>
          <dt>Email Delivery Status</dt>
          <dd>
            <span className={`comm-status comm-status--${comm.delivery_status}`}>
              {DELIVERY_LABELS[comm.delivery_status] ?? comm.delivery_status}
            </span>
          </dd>
        </div>
        <div><dt>Last Email Sent</dt><dd>{formatWhen(comm.last_email_sent_at)}</dd></div>
        <div><dt>Last Resend Time</dt><dd>{formatWhen(comm.last_resend_at)}</dd></div>
        <div><dt>Resend Count</dt><dd>{comm.resend_count}</dd></div>
        {comm.last_email_failed_at && (
          <div><dt>Last Failure</dt><dd>{formatWhen(comm.last_email_failed_at)}</dd></div>
        )}
        {comm.last_failure_reason && (
          <div><dt>Failure Reason</dt><dd>{comm.last_failure_reason}</dd></div>
        )}
      </dl>
    </CollapsibleCard>
  );
}

export function AttendeeWorkspace({
  profile,
  variant,
}: {
  profile: AttendeeProfile;
  variant: 'profile' | 'support';
}) {
  const { snapshot, personal } = profile;
  const isSupport = variant === 'support';

  return (
    <>
      <ProfileAlerts alerts={profile.alerts} />

      {isSupport && (
        <CollapsibleCard title="Registration Summary" defaultOpen>
          <dl className="detail-dl">
            <div><dt>Registration Status</dt><dd><RegistrationStatusBadge status={snapshot.registration_status} /></dd></div>
            <div><dt>Payment Status</dt><dd><PaymentStatusBadge status={snapshot.payment_status} /></dd></div>
            <div><dt>Check-In Status</dt><dd><CheckInStatusBadge status={snapshot.check_in_status} /></dd></div>
            <div><dt>Purchased Pass</dt><dd>{snapshot.purchased_pass}</dd></div>
            <div><dt>Registration Date</dt><dd>{formatWhen(snapshot.registration_date)}</dd></div>
          </dl>
        </CollapsibleCard>
      )}

      <CollapsibleCard title={isSupport ? 'Contact Information' : 'Personal Information'} defaultOpen>
        <dl className="detail-dl">
          <div><dt>Full Name</dt><dd>{personal.full_name}</dd></div>
          <div><dt>Email</dt><dd>{personal.email}</dd></div>
          <div><dt>Phone</dt><dd>{personal.phone}</dd></div>
          <div><dt>College / Organization</dt><dd>{personal.college}</dd></div>
          <div><dt>City</dt><dd>{personal.city || '—'}</dd></div>
          {!isSupport && (
            <>
              <div><dt>State</dt><dd>{personal.state || '—'}</dd></div>
              <div><dt>Country</dt><dd>{personal.country || '—'}</dd></div>
            </>
          )}
        </dl>
      </CollapsibleCard>

      {isSupport && <CommunicationCard profile={profile} />}

      {!isSupport && (
        <>
          <CollapsibleCard title="Purchased Events / Passes">
            {profile.purchased_passes.length === 0 ? (
              <p className="muted">No passes purchased.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Pass</th>
                      <th>Qty</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.purchased_passes.map((pass) => (
                      <tr key={pass.registration_item_id}>
                        <td>{pass.event_name}</td>
                        <td>{pass.pass_name}</td>
                        <td>{pass.quantity}</td>
                        <td>{pass.amount}</td>
                        <td><RegistrationStatusBadge status={pass.registration_status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CollapsibleCard>
          <CollapsibleCard title="Payment Information">
            <dl className="detail-dl">
              <div><dt>Payment Status</dt><dd><PaymentStatusBadge status={profile.payment.payment_status} /></dd></div>
              <div><dt>Payment Date</dt><dd>{formatWhen(profile.payment.payment_date)}</dd></div>
              <div><dt>Payment Method</dt><dd>{profile.payment.payment_method || '—'}</dd></div>
            </dl>
          </CollapsibleCard>
        </>
      )}

      <CollapsibleCard title="Registration Responses" defaultOpen={isSupport}>
        {profile.registration_responses.length === 0 ? (
          <p className="muted">No registration responses.</p>
        ) : (
          profile.registration_responses.map((group) => (
            <div key={group.event_id} className="response-group">
              <h4 className="response-group-title">{group.event_name}</h4>
              <FormAnswerRenderer answers={group.answers} />
            </div>
          ))
        )}
      </CollapsibleCard>

      {!isSupport && (
        <CollapsibleCard title="Check-In Information">
          {profile.check_in.checked_in ? (
            <dl className="detail-dl">
              <div><dt>Checked In</dt><dd>Yes</dd></div>
              <div><dt>Checked By</dt><dd>{profile.check_in.checked_by || '—'}</dd></div>
              <div><dt>Checked At</dt><dd>{formatWhen(profile.check_in.checked_at)}</dd></div>
              <div><dt>Check-In Notes</dt><dd>{profile.check_in.notes || '—'}</dd></div>
            </dl>
          ) : (
            <p className="profile-checkin-empty">Not Checked In</p>
          )}
        </CollapsibleCard>
      )}

      <CollapsibleCard title={isSupport ? 'Support Notes' : 'Internal Notes'} defaultOpen={isSupport}>
        {profile.internal_notes.length === 0 ? (
          <p className="muted">No internal notes yet.</p>
        ) : (
          <ul className="notes-list">
            {profile.internal_notes.map((note) => (
              <li key={note.id} className="notes-list-item">
                <p className="notes-list-category">{note.category || 'General'}</p>
                <p className="notes-list-body">{note.note}</p>
                <p className="notes-list-meta">
                  {note.created_by} · {formatWhen(note.created_at)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CollapsibleCard>

      <CollapsibleCard title="Activity Timeline" defaultOpen={isSupport}>
        <ProfileTimeline entries={profile.activity_timeline} />
      </CollapsibleCard>

      {profile.support_extensions && isSupport && (
        <div className="support-extensions muted" aria-label="Future support features">
          <p className="support-extensions-label">Coming soon: tickets, escalations, assignments, priorities</p>
        </div>
      )}
    </>
  );
}
