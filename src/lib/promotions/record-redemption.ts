import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export async function recordPromotionRedemption(
  admin: SupabaseClient<Database>,
  input: { promotionId: string; userId: string | null; orderId: string }
): Promise<void> {
  if (!input.userId) return;

  const { error } = await admin
    .from("promotion_redemptions")
    .upsert(
      { promotion_id: input.promotionId, user_id: input.userId, order_id: input.orderId },
      { onConflict: "promotion_id,user_id", ignoreDuplicates: true }
    );

  if (error) {
    console.error(
      `Promotion ${input.promotionId} redemption could not be recorded for order ${input.orderId}:`,
      error
    );
  }
}
