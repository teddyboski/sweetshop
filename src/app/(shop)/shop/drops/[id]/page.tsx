import { notFound } from "next/navigation";
import { getDropById } from "@/lib/supabase/queries/catalog";
import { formatPriceCents } from "@/lib/utils";
import { ProductImage } from "@/components/shared/product-image";
import { DropCountdown } from "@/components/shared/drop-countdown";
import { Button } from "@/components/ui/button";

interface DropPageProps {
  params: Promise<{ id: string }>;
}

function getDropWindowStatus(drop: { units_sold: number; quantity_limit: number; starts_at: string; ends_at: string }) {
  const now = Date.now();
  const isSoldOut = drop.units_sold >= drop.quantity_limit;
  const isBeforeStart = now < new Date(drop.starts_at).getTime();
  const isAfterEnd = now > new Date(drop.ends_at).getTime();
  return { isSoldOut, isBeforeStart, isAfterEnd, canBuy: !isSoldOut && !isBeforeStart && !isAfterEnd };
}

export default async function DropPage({ params }: DropPageProps) {
  const { id } = await params;
  const drop = await getDropById(id);
  if (!drop || !drop.boxes) notFound();

  const { isSoldOut, isBeforeStart, isAfterEnd, canBuy } = getDropWindowStatus(drop);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <ProductImage imageUrl={null} alt={drop.boxes.title} className="rounded-xl" />
        <div>
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium uppercase text-destructive">
            Limited Drop
          </span>
          <h1 className="mt-2 font-heading text-2xl font-semibold">{drop.boxes.title}</h1>
          <p className="mt-2 text-xl font-medium">{formatPriceCents(drop.boxes.price_cents)}</p>

          <div className="mt-6">
            {!isAfterEnd && <DropCountdown endsAt={drop.ends_at} />}
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            {drop.units_sold} of {drop.quantity_limit} claimed
          </p>

          <div className="mt-6">
            {canBuy ? (
              <Button size="lg">Buy Now</Button>
            ) : (
              <p className="font-medium text-muted-foreground">
                {isSoldOut ? "Sold out" : isBeforeStart ? "Not yet available" : "This drop has ended"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
