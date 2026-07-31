import { RoleChangeForm } from "@/components/features/admin/role-change-form";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <div className="max-w-md">
      <h1 className="font-heading text-2xl font-semibold">Settings</h1>

      <h2 className="mt-6 font-heading text-lg font-semibold">Admin role management</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Calls the existing role endpoint from Milestone 2 - no new backend here.
      </p>
      <div className="mt-2 rounded-lg border p-4">
        <RoleChangeForm />
      </div>
    </div>
  );
}
