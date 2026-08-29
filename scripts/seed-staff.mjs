/**
 * Creates one shop staff login per merchant.
 *
 *   node scripts/seed-staff.mjs
 *
 * Environment variables override .env.local, so this can target a hosted
 * project. It prints which project it is about to write to, because seeding
 * the wrong one is silent and annoying to undo.
 *
 * The default password is a development convenience. Anything reachable from
 * the internet must be given a real one:
 *
 *   SHOP_PASSWORD='...' node scripts/seed-staff.mjs
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

const PASSWORD = process.env.SHOP_PASSWORD ?? "gatedelivery";
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
const isLocal = /localhost|127\.0\.0\.1/.test(host);

console.log(`target project : ${host}${isLocal ? "  (local)" : "  (HOSTED)"}`);
console.log(`password       : ${PASSWORD === "gatedelivery" ? "gatedelivery  (default)" : "custom"}`);

if (!isLocal && PASSWORD === "gatedelivery") {
  console.error("\nRefusing to seed a hosted project with the default password.");
  console.error("It is published in this repository, so every shop would share a");
  console.error("password anyone can read. Set one explicitly:\n");
  console.error("  SHOP_PASSWORD='<something strong>' node scripts/seed-staff.mjs\n");
  process.exit(1);
}

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
