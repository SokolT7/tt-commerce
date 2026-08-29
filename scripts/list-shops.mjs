/**
 * Prints every shop with its login and its direct console link.
 *
 * Reads whichever Supabase project .env.local points at, so it is accurate for
 * local and hosted alike. Passwords are never stored in readable form and are
 * not printed — reset one from the Supabase dashboard under Authentication.
 *
 *   node scripts/list-shops.mjs
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = {};
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("No .env.local found.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const [{ data: merchants }, { data: staff }, { data: admins }] = await Promise.all([
  db.from("merchants").select("id, name, slug, zone, open").order("name"),
  db.from("merchant_staff").select("merchant_id, user_id, role"),
  db.from("platform_admins").select("user_id, name"),
]);

const { data: userList } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
const emailOf = new Map((userList?.users ?? []).map((u) => [u.id, u.email]));

const rows = (merchants ?? []).map((m) => {
  const links = (staff ?? []).filter((s) => s.merchant_id === m.id);
  return {
    name: m.name,
    zone: m.zone,
    open: m.open,
    logins: links.map((l) => `${emailOf.get(l.user_id) ?? "unknown"} (${l.role})`),
    link: `${appUrl}/merchant/${m.slug}`,
  };
});

const pad = (s, n) => String(s).padEnd(n);
const w1 = Math.max(4, ...rows.map((r) => r.name.length));
const w2 = Math.max(5, ...rows.flatMap((r) => (r.logins.length ? r.logins : ["—"]).map((l) => l.length)));

console.log(`\n${pad("SHOP", w1)}  ${pad("LOGIN", w2)}  LINK TO SEND THEM`);
console.log("-".repeat(w1 + w2 + 40));

for (const r of rows) {
  const first = r.logins[0] ?? "— no login yet —";
  const flag = r.open ? "" : "  [closed]";
  console.log(`${pad(r.name, w1)}  ${pad(first, w2)}  ${r.link}${flag}`);
  for (const extra of r.logins.slice(1)) console.log(`${pad("", w1)}  ${extra}`);
}

console.log(`\n${rows.length} shops · ${(admins ?? []).length} platform admin(s)`);
for (const a of admins ?? []) {
  console.log(`  admin: ${emailOf.get(a.user_id) ?? "unknown"}${a.name ? ` (${a.name})` : ""} -> ${appUrl}/admin`);
}
console.log("\nPasswords are hashed and cannot be listed. Reset one in the");
console.log("Supabase dashboard under Authentication -> Users.\n");
