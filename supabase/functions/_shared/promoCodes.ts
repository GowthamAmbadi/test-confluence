import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export interface PromoValidationResult {
  valid: boolean;
  code: string | null;
  promo_code_id?: string;
  discount_type?: string;
  discount_value?: number;
  discount_amount: number;
  final_amount: number;
  message: string;
}

export async function validatePromoCode(
  supabase: SupabaseClient,
  params: { code: string; event_id: string; subtotal: number },
): Promise<PromoValidationResult> {
  const { data, error } = await supabase.rpc('validate_promo_code', {
    p_code: params.code,
    p_event_id: params.event_id,
    p_subtotal: params.subtotal,
  });

  if (error) {
    console.error('validate_promo_code error:', error);
    throw new Error('Promo validation failed');
  }

  return data as PromoValidationResult;
}

export function calculateDiscountAmount(
  discountType: 'fixed' | 'percentage',
  discountValue: number,
  subtotal: number,
): number {
  if (discountType === 'fixed') {
    return Math.min(discountValue, Math.max(subtotal, 0));
  }
  return Math.round(Math.max(subtotal, 0) * discountValue) / 100;
}
