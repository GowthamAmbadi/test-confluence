import { Resend } from 'npm:resend@4.0.0';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const CONFLUENCE_2026_EVENT_DATES = 'August 3–7, 2026';
export const CONFLUENCE_2026_EVENT_LOCATION = 'Hyderabad, India';
export const CONFLUENCE_2026_SUPPORT_EMAIL = 'confluence@yanc.in';
export const PAYMENT_CONFIRMATION_EMAIL_SUBJECT = 'Confluence 2026 Registration Confirmed';

/** Per-event schedule — keyed by events.slug (not pass display names). */
const EVENT_SCHEDULE_BY_SLUG: Record<string, { dates: string; dayLabel: string }> = {
  'learning-lab': { dates: 'August 3–5, 2026', dayLabel: 'Monday – Wednesday' },
  'concept-cocoon': { dates: 'August 6, 2026', dayLabel: 'Thursday' },
  'networking-gala': { dates: 'August 7, 2026', dayLabel: 'Friday' },
  'all-access': { dates: 'August 3–7, 2026', dayLabel: 'Full festival access' },
};

export interface PaymentConfirmationPass {
  name: string;
  slug: string;
  quantity: number;
  unitPrice: number;
  eventDates: string;
  dayLabel: string;
}

export interface PaymentConfirmationContext {
  attendeeName: string;
  attendeeEmail: string;
  registrationReference: string;
  passes: PaymentConfirmationPass[];
  paymentStatus: string;
  eventLocation: string;
  supportEmail: string;
  totalAmount: number | null;
  currency: string;
  festivalDates: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  registration_id: string;
  order_id: string;
  razorpay_payment_id: string;
  registrations: {
    full_name: string;
    email: string;
    registration_id: string | null;
    status: string;
  } | null;
}

interface RegistrationItemRow {
  quantity: number;
  unit_price: number;
  events: { name: string; slug: string } | { name: string; slug: string }[] | null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatCurrency(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  if (code === 'INR') {
    return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${code} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getEventSchedule(slug: string): { dates: string; dayLabel: string } {
  return EVENT_SCHEDULE_BY_SLUG[slug] ?? {
    dates: CONFLUENCE_2026_EVENT_DATES,
    dayLabel: 'Confluence 2026',
  };
}

function detailField(label: string, value: string, options?: { highlight?: boolean; valueColor?: string }): string {
  const valueStyle = [
    'margin:6px 0 0',
    'font-size:15px',
    'line-height:1.5',
    'color:#1a1a2e',
    'word-break:break-word',
    'overflow-wrap:anywhere',
    options?.highlight ? 'font-weight:600' : 'font-weight:400',
    options?.valueColor ? `color:${options.valueColor}` : '',
  ].filter(Boolean).join(';');

  return `
    <tr>
      <td style="padding:0 0 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8f6f1;border:1px solid #ebe6dc;border-radius:10px;">
          <tr>
            <td style="padding:14px 16px;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;letter-spacing:0.14em;text-transform:uppercase;color:#6b6b84;">${escapeHtml(label)}</div>
              <div style="font-family:Georgia,'Times New Roman',serif;${valueStyle}">${escapeHtml(value)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function normalizeEvent(events: RegistrationItemRow['events']): { name: string; slug: string } {
  if (!events) return { name: 'Event Pass', slug: '' };
  const event = Array.isArray(events) ? events[0] : events;
  return {
    name: event?.name ?? 'Event Pass',
    slug: event?.slug ?? '',
  };
}

export function buildPaymentConfirmationEmailHtml(context: PaymentConfirmationContext): string {
  const passCards = context.passes
    .map((pass) => {
      const lineTotal = pass.unitPrice * pass.quantity;
      const quantityLabel = pass.quantity > 1 ? ` · Qty ${pass.quantity}` : '';
      return `
        <tr>
          <td style="padding:0 0 12px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e8e4dc;border-radius:10px;overflow:hidden;background-color:#ffffff;">
              <tr>
                <td style="padding:16px 18px;">
                  <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.45;color:#1a1a2e;font-weight:600;word-break:break-word;">${escapeHtml(pass.name)}${quantityLabel}</div>
                  <div style="margin-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.65;color:#4a4a68;">
                    <div><strong style="color:#1a1a2e;">Your dates:</strong> ${escapeHtml(pass.eventDates)}</div>
                    <div style="margin-top:4px;color:#6b6b84;">${escapeHtml(pass.dayLabel)}</div>
                  </div>
                  <div style="margin-top:12px;padding-top:12px;border-top:1px solid #ebe6dc;">
                    <span style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6b6b84;">Amount</span>
                    <span style="margin-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:17px;line-height:1.3;color:#b8860b;font-weight:600;">${escapeHtml(formatCurrency(lineTotal, context.currency))}</span>
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`;
    })
    .join('');

  const scheduleRows = context.passes
    .map((pass) => detailField(pass.name, `${pass.eventDates} (${pass.dayLabel})`))
    .join('');

  const totalPaidBlock = context.totalAmount != null
    ? `
        <tr>
          <td style="padding:8px 0 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1a2e;border-radius:10px;">
              <tr>
                <td style="padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#d4af37;">Total Paid</td>
                <td style="padding:16px 18px;text-align:right;font-family:Georgia,'Times New Roman',serif;font-size:20px;color:#ffffff;font-weight:600;">${escapeHtml(formatCurrency(context.totalAmount, context.currency))}</td>
              </tr>
            </table>
          </td>
        </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(PAYMENT_CONFIRMATION_EMAIL_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f1ea;font-family:Georgia,'Times New Roman',serif;color:#1a1a2e;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f1ea;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e8e4dc;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#1a1a2e 0%,#2d2d4a 100%);padding:32px 28px;text-align:center;">
              <h1 style="margin:0;font-size:30px;line-height:1.2;color:#ffffff;font-weight:400;">YANC Confluence</h1>
              <p style="margin:10px 0 0;font-size:14px;letter-spacing:0.12em;color:#d4af37;">2026</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 8px;">
              <h2 style="margin:0 0 12px;font-size:24px;font-weight:400;color:#1a1a2e;">Registration Confirmed</h2>
              <p style="margin:0;font-size:15px;line-height:1.7;color:#4a4a68;">
                Thank you, ${escapeHtml(context.attendeeName)}. Your payment has been verified and your registration for Confluence 2026 is confirmed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;">
              <h3 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#b8860b;">Registration Details</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${detailField('Attendee Name', context.attendeeName, { highlight: true })}
                ${detailField('Email', context.attendeeEmail)}
                ${detailField('Registration Reference', context.registrationReference, { highlight: true })}
                ${detailField('Payment Status', context.paymentStatus, { highlight: true, valueColor: '#1f7a4d' })}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;">
              <h3 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#b8860b;">Pass Information</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${passCards}
                ${totalPaidBlock}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;">
              <h3 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#b8860b;">Your Event Schedule</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${scheduleRows}
                ${detailField('Location', context.eventLocation)}
              </table>
              <p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6b6b84;">
                Confluence 2026 runs ${escapeHtml(context.festivalDates)}. Your confirmation above reflects the dates for your registered pass${context.passes.length > 1 ? 'es' : ''}.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 32px;">
              <p style="margin:0;font-size:14px;line-height:1.7;color:#4a4a68;">
                Please keep this email for your records. If you have questions about your registration, contact us at
                <a href="mailto:${escapeHtml(context.supportEmail)}" style="color:#b8860b;text-decoration:none;">${escapeHtml(context.supportEmail)}</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8f6f1;padding:20px 28px;text-align:center;border-top:1px solid #e8e4dc;">
              <p style="margin:0 0 6px;font-size:12px;color:#6b6b84;">Confluence 2026 · YANC Young Minds · Networking · Life Skills</p>
              <p style="margin:0;font-size:12px;color:#6b6b84;">${escapeHtml(context.festivalDates)} · ${escapeHtml(context.eventLocation)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendPaymentConfirmationEmail(params: {
  resendApiKey: string;
  fromEmail: string;
  toEmail: string;
  context: PaymentConfirmationContext;
}): Promise<{ success: true; messageId: string } | { success: false; error: string }> {
  const resend = new Resend(params.resendApiKey);

  const { data, error } = await resend.emails.send({
    from: params.fromEmail,
    to: [params.toEmail],
    subject: PAYMENT_CONFIRMATION_EMAIL_SUBJECT,
    html: buildPaymentConfirmationEmailHtml(params.context),
  });

  if (error) {
    return { success: false, error: error.message ?? 'Resend API error' };
  }

  if (!data?.id) {
    return { success: false, error: 'Resend returned no message id' };
  }

  return { success: true, messageId: data.id };
}

async function hasConfirmationEmailBeenSent(
  supabase: SupabaseClient,
  registrationId: string,
  paymentId: string,
  razorpayPaymentId: string,
): Promise<boolean> {
  const { data: byPaymentId } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('event_type', 'EMAIL_SENT')
    .eq('registration_id', registrationId)
    .eq('payment_id', paymentId)
    .limit(1)
    .maybeSingle();

  if (byPaymentId) return true;

  const { data: byMetadata } = await supabase
    .from('audit_logs')
    .select('id')
    .eq('event_type', 'EMAIL_SENT')
    .eq('registration_id', registrationId)
    .eq('metadata->>razorpay_payment_id', razorpayPaymentId)
    .limit(1)
    .maybeSingle();

  return !!byMetadata;
}

async function logEmailAudit(
  supabase: SupabaseClient,
  eventType: 'EMAIL_SENT' | 'EMAIL_FAILED',
  params: {
    registrationId: string;
    orderId: string;
    paymentId: string;
    razorpayPaymentId: string;
    recipientEmail: string;
    messageId?: string;
    error?: string;
  },
): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert({
    event_type: eventType,
    entity_type: 'email',
    entity_id: null,
    registration_id: params.registrationId,
    order_id: params.orderId,
    payment_id: params.paymentId,
    actor_type: 'webhook',
    metadata: {
      razorpay_payment_id: params.razorpayPaymentId,
      recipient_email: params.recipientEmail,
      ...(params.messageId ? { resend_message_id: params.messageId } : {}),
      ...(params.error ? { error: params.error } : {}),
    },
  });

  if (error) {
    console.error(`Failed to write ${eventType} audit log:`, error);
  }
}

async function loadPaymentConfirmationContext(
  supabase: SupabaseClient,
  razorpayPaymentId: string,
): Promise<{
  payment: PaymentRecord;
  context: PaymentConfirmationContext;
} | null> {
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select(`
      id,
      amount,
      currency,
      status,
      registration_id,
      order_id,
      razorpay_payment_id,
      registrations (
        full_name,
        email,
        registration_id,
        status
      )
    `)
    .eq('razorpay_payment_id', razorpayPaymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    console.error('Payment lookup failed for confirmation email:', paymentError);
    return null;
  }

  const registration = payment.registrations;
  if (!registration) {
    console.error('Registration missing for payment confirmation email:', payment.id);
    return null;
  }

  if (registration.status !== 'PAYMENT_COMPLETE' || !registration.registration_id) {
    console.warn('Registration not approved yet; skipping confirmation email:', payment.registration_id);
    return null;
  }

  if (payment.status !== 'captured') {
    console.warn('Payment not captured; skipping confirmation email:', payment.id);
    return null;
  }

  const { data: items, error: itemsError } = await supabase
    .from('registration_items')
    .select(`
      quantity,
      unit_price,
      events ( name, slug )
    `)
    .eq('registration_id', payment.registration_id);

  if (itemsError || !items?.length) {
    console.error('Registration items missing for confirmation email:', itemsError);
    return null;
  }

  const passes = (items as RegistrationItemRow[]).map((item) => {
    const event = normalizeEvent(item.events);
    const schedule = getEventSchedule(event.slug);
    return {
      name: event.name,
      slug: event.slug,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      eventDates: schedule.dates,
      dayLabel: schedule.dayLabel,
    };
  });

  return {
    payment: payment as PaymentRecord,
    context: {
      attendeeName: registration.full_name,
      attendeeEmail: registration.email,
      registrationReference: registration.registration_id,
      passes,
      paymentStatus: 'Confirmed',
      festivalDates: CONFLUENCE_2026_EVENT_DATES,
      eventLocation: CONFLUENCE_2026_EVENT_LOCATION,
      supportEmail: CONFLUENCE_2026_SUPPORT_EMAIL,
      totalAmount: Number(payment.amount),
      currency: payment.currency ?? 'INR',
    },
  };
}

/**
 * Sends payment confirmation email after successful webhook processing.
 * Never throws — payment processing must not depend on email delivery.
 */
export async function deliverPaymentConfirmationEmailIfNeeded(
  supabase: SupabaseClient,
  params: {
    razorpayPaymentId: string;
    rpcStatus: string;
  },
): Promise<void> {
  const eligibleStatuses = new Set(['captured', 'already_processed', 'already_paid']);
  if (!eligibleStatuses.has(params.rpcStatus)) {
    return;
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const fromEmail = Deno.env.get('FROM_EMAIL');

    const loaded = await loadPaymentConfirmationContext(supabase, params.razorpayPaymentId);
    if (!loaded) {
      return;
    }

    const { payment, context } = loaded;

    const alreadySent = await hasConfirmationEmailBeenSent(
      supabase,
      payment.registration_id,
      payment.id,
      payment.razorpay_payment_id,
    );
    if (alreadySent) {
      return;
    }

    if (!resendApiKey || !fromEmail) {
      const configError = !resendApiKey && !fromEmail
        ? 'RESEND_API_KEY and FROM_EMAIL are not configured'
        : !resendApiKey
        ? 'RESEND_API_KEY is not configured'
        : 'FROM_EMAIL is not configured';

      console.error('Payment confirmation email skipped:', configError);
      await logEmailAudit(supabase, 'EMAIL_FAILED', {
        registrationId: payment.registration_id,
        orderId: payment.order_id,
        paymentId: payment.id,
        razorpayPaymentId: payment.razorpay_payment_id,
        recipientEmail: context.attendeeEmail,
        error: configError,
      });
      return;
    }

    const result = await sendPaymentConfirmationEmail({
      resendApiKey,
      fromEmail,
      toEmail: context.attendeeEmail,
      context,
    });

    if (!result.success) {
      console.error('Payment confirmation email failed:', result.error);
      await logEmailAudit(supabase, 'EMAIL_FAILED', {
        registrationId: payment.registration_id,
        orderId: payment.order_id,
        paymentId: payment.id,
        razorpayPaymentId: payment.razorpay_payment_id,
        recipientEmail: context.attendeeEmail,
        error: result.error,
      });
      return;
    }

    await logEmailAudit(supabase, 'EMAIL_SENT', {
      registrationId: payment.registration_id,
      orderId: payment.order_id,
      paymentId: payment.id,
      razorpayPaymentId: payment.razorpay_payment_id,
      recipientEmail: context.attendeeEmail,
      messageId: result.messageId,
    });
  } catch (err) {
    console.error('Unexpected payment confirmation email error:', err);
  }
}
