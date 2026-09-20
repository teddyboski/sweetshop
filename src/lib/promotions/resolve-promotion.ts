import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import {
  decidePromotion,
  type PromotionFacts,
  type PromotionRecord,
} from "@/lib/promotions/decide-promotion";

type AdminClient = SupabaseClient<Database>;

const PROMOTION_COLUMNS =
  "id, code, discount_type, value, usage_limit, used_count, expires_at, first_order_only";
const PAID_ORDER_STATUSES = ["paid", "fulfilled", "shipped"];

export const OFFER_CHECK_UNAVAILABLE_MESSAGE = "We couldn't check that offer right now. Please try again.";

export type ResolvedPromotion =
  | { ok: true; promotionId: string | null; discountCents: number; description: string | null }
  | { ok: false; status: 400 | 503; message: string };

const NO_PROMOTION: ResolvedPromotion = {
  ok: true,
  promotionId: null,
  discountCents: 0,
  description: null,
};

async function findPromotion(admin: AdminClient, code: string): Promise<PromotionRecord | null> {
  const { data } = await admin
    .from("promotions")
    .select(PROMOTION_COLUMNS)
    .eq("code", code.toUpperCase())
    .maybeSingle();
  return data;
}

async function loadFacts(
  admin: AdminClient,
  promotion: PromotionRecord,
  userId: string | null
): Promise<PromotionFacts | null> {
  if (!userId || !promotion.first_order_only) {
    return { userId, hasPriorPaidOrder: false, hasRedeemed: false };
  }

  const [orders, redemption] = await Promise.all([
    admin
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .in("status", PAID_ORDER_STATUSES)
      .is("deleted_at", null)
      .limit(1),
    admin
      .from("promotion_redemptions")
      .select("id")
      .eq("promotion_id", promotion.id)
      .eq("user_id", userId)
      .limit(1),
  ]);

  if (orders.error || redemption.error) return null;

  return {
    userId,
    hasPriorPaidOrder: (orders.data ?? []).length > 0,
    hasRedeemed: (redemption.data ?? []).length > 0,
  };
}

export async function resolvePromotion(
  admin: AdminClient,
  input: { userId: string | null; promoCode?: string; subtotalCents: number }
): Promise<ResolvedPromotion> {
  const typedCode = input.promoCode?.trim();

  if (typedCode) {
    const promotion = await findPromotion(admin, typedCode);
    const facts = promotion
      ? await loadFacts(admin, promotion, input.userId)
      : { userId: input.userId, hasPriorPaidOrder: false, hasRedeemed: false };
    if (!facts) {
      return { ok: false, status: 503, message: OFFER_CHECK_UNAVAILABLE_MESSAGE };
    }
    return decidePromotion({ promotion, facts, subtotalCents: input.subtotalCents });
  }

  if (!input.userId) return NO_PROMOTION;

  const { data: profile } = await admin
    .from("profiles")
    .select("signup_offer_code")
    .eq("id", input.userId)
    .maybeSingle();
  if (!profile?.signup_offer_code) return NO_PROMOTION;

  const promotion = await findPromotion(admin, profile.signup_offer_code);
  if (!promotion?.first_order_only) return NO_PROMOTION;

  const facts = await loadFacts(admin, promotion, input.userId);
  if (!facts) return NO_PROMOTION;
  const decision = decidePromotion({ promotion, facts, subtotalCents: input.subtotalCents });
  return decision.ok ? decision : NO_PROMOTION;
}
