import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminDashboard } from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  // Checked server-side with the service role so the guard does not depend on
  // the browser session being trusted.
  const db = createAdminClient();
  const { data: admin } = await db
    .from("platform_admins").select("name")
    .eq("user_id", user.id).maybeSingle();

  if (!admin) redirect("/admin/login?denied=1");

  // Only whether credentials are present — never the credentials themselves.
  const fidsConfigured = Boolean(
    process.env.FLIGHTSTATS_APP_ID?.trim() && process.env.FLIGHTSTATS_APP_KEY?.trim(),
  );

  return (
    <AdminDashboard
      name={admin.name || user.email || "Operator"}
      fidsConfigured={fidsConfigured}
    />
  );
}
