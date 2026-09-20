export interface PromotionRecord {
  id: string;
  code: string;
  discount_type: string;
  value: number;
  usage_limit: number | null;
  used_count: number;
  expires_at: string | null;
  first_order_only: boolean;
}

export interface PromotionFacts {
  userId: string | null;
  hasPriorPaidOrder: boolean;
  hasRedeemed: boolean;
}

export type PromotionDecision =
  | { ok: true; promotionId: string; discountCents: number; description: string }
  | { ok: false; status: 400; message: string };

export const INVALID_PROMO_MESSAGE = "That promo code isn't valid";
export const FIRST_ORDER_ONLY_MESSAGE = "That offer is for your first order only";
export const LOGIN_FOR_OFFER_MESSAGE = "Log in or sign up to use this offer";

export function isPromotionUsable(promotion: PromotionRecord, now: Date): boolean {
  return (
    (promotion.usage_limit === null || promotion.used_count < promotion.usage_limit) &&
    (promotion.expires_at === null || new Date(promotion.expires_at) > now)
  );
}

export function computeDiscountCents(promotion: PromotionRecord, subtotalCents: number): number {
  return promotion.discount_type === "percent"
    ? Math.round((subtotalCents * Number(promotion.value)) / 100)
    : Math.round(Number(promotion.value));
}

export function describeDiscount(promotion: PromotionRecord): string {
  return promotion.discount_type === "percent"
    ? `${Number(promotion.value)}% off`
    : `$${(Number(promotion.value) / 100).toFixed(2)} off`;
}

export function decidePromotion(input: {
  promotion: PromotionRecord | null;
  facts: PromotionFacts;
  subtotalCents: number;
  now?: Date;
}): PromotionDecision {
  const { promotion, facts, subtotalCents } = input;

  if (!promotion || !isPromotionUsable(promotion, input.now ?? new Date())) {
    return { ok: false, status: 400, message: INVALID_PROMO_MESSAGE };
  }

  if (promotion.first_order_only) {
    if (!facts.userId) {
      return { ok: false, status: 400, message: LOGIN_FOR_OFFER_MESSAGE };
    }
    if (facts.hasPriorPaidOrder || facts.hasRedeemed) {
      return { ok: false, status: 400, message: FIRST_ORDER_ONLY_MESSAGE };
    }
  }

  return {
    ok: true,
    promotionId: promotion.id,
    discountCents: computeDiscountCents(promotion, subtotalCents),
    description: describeDiscount(promotion),
  };
}
