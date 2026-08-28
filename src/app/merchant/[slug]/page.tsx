import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShopConsole } from "@/components/ShopConsole";

export const dynamic = "force-dynamic";

export default async function MerchantPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/merchant/login");

  const db = createAdminClient();
  const { data: merchant } = await db.from("merchants").select("*").eq("slug", slug).maybeSingle();
  if (!merchant) notFound();

  const { data: link } = await db
    .from("merchant_staff").select("role")
    .eq("user_id", user.id).eq("merchant_id", merchant.id).maybeSingle();
  if (!link) redirect("/merchant");

  return <ShopConsole merchantId={merchant.id} slug={slug} role={link.role} />;
}
