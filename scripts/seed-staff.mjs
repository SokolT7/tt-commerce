/**
 * Creates shop staff logins for local development.
 *
 * Run: node scripts/seed-staff.mjs
 * Every account uses the same password; this is a development helper and must
 * never be run against production.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const PASSWORD = "gatedelivery";
const { data: merchants, error } = await db.from("merchants").select("id, slug, name");
if (error) throw error;

for (const m of merchants) {
  const email = `${m.slug}@shop.local`;
  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true,
    user_metadata: { merchant_slug: m.slug, display_name: m.name },
  });

  let userId = created?.user?.id;
  if (createErr) {
    const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list.users.find((u) => u.email === email)?.id;
    if (!userId) { console.error(`  ${email}: ${createErr.message}`); continue; }
  }

  await db.from("merchant_staff").upsert(
    { user_id: userId, merchant_id: m.id, role: "owner" },
    { onConflict: "user_id,merchant_id" },
  );
  console.log(`  ${email}  →  ${m.name}`);
}
console.log(`\nAll accounts use the password: ${PASSWORD}`);
