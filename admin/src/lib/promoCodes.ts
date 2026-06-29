export type PromoDiscountType = 'fixed' | 'percentage';

export interface PromoEventOption {
  id: string;
  name: string;
  slug: string;
}

export interface PromoCode {
  id: string;
  event_id: string | null;
  event_name?: string | null;
  code: string;
  description: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
  created_at: string;
  updated_at: string;
}

export interface PromoCodeFormData {
  code?: string;
  description?: string;
  event_id?: string | null;
  discount_type: PromoDiscountType;
  discount_value: number;
  valid_from?: string;
  valid_until?: string;
  max_uses?: number | null;
  is_active: boolean;
}

export function formatPromoDiscount(row: PromoCode): string {
  if (row.discount_type === 'percentage') {
    return `${row.discount_value}% OFF`;
  }
  return `₹${Number(row.discount_value).toLocaleString('en-IN')} OFF`;
}

export function formatPromoStatus(row: PromoCode): string {
  if (!row.is_active) return 'Inactive';
  if (row.valid_until && new Date(row.valid_until) < new Date()) return 'Expired';
  if (row.max_uses != null && row.used_count >= row.max_uses) return 'Limit reached';
  return 'Active';
}
