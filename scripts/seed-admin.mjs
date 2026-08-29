/**
 * Creates a platform administrator for local development.
 *
 * Unlike shop logins, this account can see and change everything across the
 * estate. It is a development helper — in production an admin is created
 * deliberately, not by a script with a fixed password.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const EMAIL = process.env.ADMIN_EMAIL ?? "admin@gatedelivery.local";
const PASSWORD = process.env.ADMIN_PASSWORD ?? "gatedelivery";
const NAME = process.env.ADMIN_NAME ?? "Platform operator";

const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const host = new URL(supaUrl).host;
const isLocal = /localhost|127\.0\.0\.1/.test(host);
console.log(`target project : ${host}${isLocal ? "  (local)" : "  (HOSTED)"}`);

if (!isLocal && PASSWORD === "gatedelivery") {
  console.error("\nRefusing to create a hosted administrator with the default password.");
  console.error("It is published in this repository. Set one explicitly:\n");
  console.error("  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='<strong>' node scripts/seed-admin.mjs\n");
  process.exit(1);
}

let userId;
const { data: created, error } = await db.auth.admin.createUser({
  email: EMAIL, password: PASSWORD, email_confirm: true,
  user_metadata: { display_name: NAME },
});

if (error) {
  if (!/already/i.test(error.message)) throw error;
  const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  userId = list.users.find((u) => u.email === EMAIL)?.id;
  console.log(`• ${EMAIL} already existed`);
} else {
  userId = created.user.id;
  console.log(`• created ${EMAIL}`);
}

if (!userId) throw new Error("could not resolve the admin user id");

const { error: upsertErr } = await db
  .from("platform_admins")
  .upsert({ user_id: userId, name: NAME }, { onConflict: "user_id" });
if (upsertErr) throw upsertErr;

console.log(`• granted platform admin to ${EMAIL}`);
console.log(`\nSign in at /admin/login with:\n  ${EMAIL}\n  ${PASSWORD}`);
