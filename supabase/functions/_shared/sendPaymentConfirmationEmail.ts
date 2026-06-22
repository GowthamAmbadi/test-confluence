import { Resend } from 'npm:resend@4.0.0';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const CONFLUENCE_2026_EVENT_DATES = 'July 6–10, 2026';
export const CONFLUENCE_2026_EVENT_LOCATION = 'Hyderabad, India';
export const CONFLUENCE_2026_SUPPORT_EMAIL = 'confluence@yanc.in';
export const PAYMENT_CONFIRMATION_EMAIL_SUBJECT = 'Confluence 2026 Registration Confirmed';

export interface PaymentConfirmationPass {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface PaymentConfirmationContext {
  attendeeName: string;
  attendeeEmail: string;
  registrationReference: string;
  passes: PaymentConfirmationPass[];
  paymentStatus: string;
  eventDates: string;
  eventLocation: string;
  supportEmail: string;
  totalAmount: number | null;
  currency: string;
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
  events: { name: string } | { name: string }[] | null;
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

export function buildPaymentConfirmationEmailHtml(context: PaymentConfirmationContext): string {
  const passRows = context.passes
    .map((pass) => {
      const lineTotal = pass.unitPrice * pass.quantity;
      const quantityLabel = pass.quantity > 1 ? ` × ${pass.quantity}` : '';
      return `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e8e4dc;color:#1a1a2e;font-size:15px;">
            ${escapeHtml(pass.name)}${quantityLabel}
          </td>
          <td style="padding:12px 0;border-bottom:1px solid #e8e4dc;color:#1a1a2e;font-size:15px;text-align:right;white-space:nowrap;">
            ${escapeHtml(formatCurrency(lineTotal, context.currency))}
          </td>
        </tr>`;
    })
    .join('');

  const totalRow = context.totalAmount != null
    ? `
        <tr>
          <td style="padding:14px 0 0;color:#1a1a2e;font-size:15px;font-weight:700;">Total Paid</td>
          <td style="padding:14px 0 0;color:#b8860b;font-size:16px;font-weight:700;text-align:right;">
            ${escapeHtml(formatCurrency(context.totalAmount, context.currency))}
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
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;line-height:1.8;">
                <tr>
                  <td style="padding:4px 0;color:#6b6b84;width:42%;">Attendee Name</td>
                  <td style="padding:4px 0;color:#1a1a2e;font-weight:600;">${escapeHtml(context.attendeeName)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6b6b84;">Email</td>
                  <td style="padding:4px 0;color:#1a1a2e;">${escapeHtml(context.attendeeEmail)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6b6b84;">Registration Reference</td>
                  <td style="padding:4px 0;color:#1a1a2e;font-weight:600;">${escapeHtml(context.registrationReference)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6b6b84;">Payment Status</td>
                  <td style="padding:4px 0;color:#1f7a4d;font-weight:600;">${escapeHtml(context.paymentStatus)}</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;">
              <h3 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#b8860b;">Pass Information</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                ${passRows}
                ${totalRow}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;">
              <h3 style="margin:0 0 14px;font-size:13px;letter-spacing:0.16em;text-transform:uppercase;color:#b8860b;">Event Information</h3>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size:15px;line-height:1.8;">
                <tr>
                  <td style="padding:4px 0;color:#6b6b84;width:42%;">Event Dates</td>
                  <td style="padding:4px 0;color:#1a1a2e;">${escapeHtml(context.eventDates)}</td>
                </tr>
                <tr>
                  <td style="padding:4px 0;color:#6b6b84;">Event Location</td>
                  <td style="padding:4px 0;color:#1a1a2e;">${escapeHtml(context.eventLocation)}</td>
                </tr>
              </table>
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
              <p style="margin:0;font-size:12px;color:#6b6b84;">${escapeHtml(context.eventDates)} · ${escapeHtml(context.eventLocation)}</p>
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

function normalizeEventName(events: RegistrationItemRow['events']): string {
  if (!events) return 'Event Pass';
  if (Array.isArray(events)) return events[0]?.name ?? 'Event Pass';
  return events.name;
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
      events ( name )
    `)
    .eq('registration_id', payment.registration_id);

  if (itemsError || !items?.length) {
    console.error('Registration items missing for confirmation email:', itemsError);
    return null;
  }

  const passes = (items as RegistrationItemRow[]).map((item) => ({
    name: normalizeEventName(item.events),
    quantity: item.quantity,
    unitPrice: Number(item.unit_price),
  }));

  return {
    payment: payment as PaymentRecord,
    context: {
      attendeeName: registration.full_name,
      attendeeEmail: registration.email,
      registrationReference: registration.registration_id,
      passes,
      paymentStatus: 'Confirmed',
      eventDates: CONFLUENCE_2026_EVENT_DATES,
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
