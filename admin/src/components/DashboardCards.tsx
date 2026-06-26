import type { DashboardCards } from '../lib/dashboard';

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

const CARD_ITEMS: Array<{ key: keyof DashboardCards; label: string; format?: 'currency' }> = [
  { key: 'total_registrations', label: 'Total Registrations' },
  { key: 'payment_complete', label: 'Payment Complete' },
  { key: 'payment_pending', label: 'Payment Pending' },
  { key: 'checked_in', label: 'Checked In' },
  { key: 'pending_check_in', label: 'Pending Check-In' },
  { key: 'revenue', label: 'Revenue', format: 'currency' },
  { key: 'today_registrations', label:"Today's Registrations" },
  { key: 'today_revenue', label:"Today's Revenue", format: 'currency' },
];

export function DashboardCardsGrid({ cards }: { cards: DashboardCards }) {
  return (
    <div className="dash-cards">
      {CARD_ITEMS.map((item) => (
        <article key={item.key} className="dash-card">
          <p className="dash-card-label">{item.label}</p>
          <p className="dash-card-value">
            {item.format === 'currency' ? formatINR(cards[item.key]) : cards[item.key]}
          </p>
        </article>
      ))}
    </div>
  );
}
