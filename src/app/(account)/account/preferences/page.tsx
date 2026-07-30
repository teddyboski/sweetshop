import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPreferences, getAddresses } from "@/lib/supabase/queries/account";
import { PreferencesForm } from "@/components/features/account/preferences-form";
import { AddressManager } from "@/components/features/account/address-manager";

export const dynamic = "force-dynamic";

export default async function AccountPreferencesPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [preferences, addresses] = await Promise.all([getPreferences(user.id), getAddresses(user.id)]);

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl font-semibold">Profile & Preferences</h1>

      <div className="mt-6">
        <PreferencesForm initialPreferences={preferences} />
      </div>

      <AddressManager initialAddresses={addresses} />
    </div>
  );
}
