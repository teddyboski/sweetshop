import { getActiveBoxes, getByoEligibleSnacks } from "@/lib/supabase/queries/catalog";
import { BuildABoxPicker } from "@/components/features/build-a-box/build-a-box-picker";

export const metadata = {
  title: "Build Your Own Box | The Sweet Shop",
  description: "Pick a size, then choose exactly that many snacks - one flat price per size.",
};

export default async function BuildABoxPage() {
  const [allBoxes, snacks] = await Promise.all([getActiveBoxes(), getByoEligibleSnacks()]);
  const boxes = allBoxes
    .filter((box) => box.box_type === "build_a_box")
    .sort((a, b) => (a.slot_count ?? 0) - (b.slot_count ?? 0));

  return <BuildABoxPicker boxes={boxes} snacks={snacks} />;
}
