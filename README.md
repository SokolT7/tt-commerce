# Gate Delivery

In-terminal ordering and delivery for Franjo Tuđman Airport (ZAG). Passengers
order from the airport's own shops and the order is brought to where they are
sitting.

This is the **production build**: Supabase backend, real authentication,
row-level security, and live updates. Robot dispatch runs against a simulated
fleet until the vendor supplies their interface.

---



## Live flight data (Cirium FlightStats FIDS)

Without credentials the app uses the seeded board. To pull the real one:

1. Sign in at [developer.flightstats.com](https://developer.flightstats.com) and
   open **My Applications**. Each application has its own `appId` / `appKey`.
2. Put them in `.env.local` and restart the dev server:

   ```
   FLIGHTSTATS_APP_ID=
   FLIGHTSTATS_APP_KEY=
   ```

3. Confirm the mapping against a real response **before** trusting it:

   ```bash
   curl -X POST 'http://localhost:3000/api/v1/fids/sync?dryRun=1' \
     -H "Authorization: Bearer $FIDS_SYNC_SECRET" | jq
   ```

   `dryRun` maps the response and returns it without writing. Check the mapped
   flights against `sampleRawRow`.

4. Then sync for real — the **Sync live board** button on the dashboard's
   Terminal tab, or the same call without `dryRun`.

### The one assumption worth knowing

FIDS publishes **departure** times, never boarding times. The acceptance engine
works against boarding, so boarding is derived:

```
boarding_at = scheduled (or estimated) gate departure − FIDS_BOARDING_LEAD_MINUTES
```

The default is 35 minutes. That is an assumption about ZAG's boarding practice,
not data from the feed — confirm it with the airport and adjust.

Other behaviour: `estimatedGateTime` overrides `scheduledGateTime` when the
airline has revised it; local times are resolved through `Europe/Zagreb`
including across DST; a destination whose country is unknown is treated as EU so
duty-free is never wrongly offered; and flights that drop off the live board are
removed unless an order references them.

Run `npm run test:fids` to exercise the mapping — 28 assertions, no network.


### Live flight data (Cirium / FlightStats FIDS)

Credentials come from developer.flightstats.com → **My Account → Applications**.
Each application has its own Application ID and Application Key, and the FIDS
API must be enabled for it.

Put them in `.env.local`, then check they work:

```bash
node scripts/test-fids.mjs
```

It reads the keys from the file, calls the live board, and prints the
departures it found. The key itself is never printed — only a masked
fingerprint — so the output is safe to share.

Once that succeeds, **Terminal → Sync live board** in the operations dashboard
pulls the board into the database. To see what the mapping produces without
writing anything:

```bash
curl -s -X POST "http://localhost:3000/api/v1/fids/sync?dryRun=1"
```

With the keys blank the seeded board stays in use, so nothing breaks.

> FIDS publishes departure times, never boarding times, and the acceptance
> engine works against boarding. Boarding is derived by subtracting
> `FIDS_BOARDING_LEAD_MINUTES` (default 35) from scheduled gate departure.
> That is an assumption — set it to MZLZ's actual gate-closure policy, because
> it decides which orders get refused.

## Signing in

| Surface | URL | Account |
|---|---|---|
| Passenger app | `/order` | none — anonymous session |
| Shop console | `/merchant/login` | `<slug>@shop.local` / `gatedelivery` |
| Operations | `/admin/login` | `admin@gatedelivery.local` / `gatedelivery` |

Shop slugs are `needstop`, `gatecafe`, `aelia`, `apron`, `pub`, `cafenero`,
`tisak`, `cakes`.

Create the accounts with:

```bash
node scripts/seed-staff.mjs   # one login per shop
node scripts/seed-admin.mjs   # the platform administrator
```

> These are development helpers with a fixed password. In production an
> administrator is created deliberately, and `platform_admins` is the only
> table that grants estate-wide access.

### What the operations dashboard covers

**Overview** — orders today, platform revenue split into commission and fees,
shop sales, late deliveries, units available, incidents, items off sale.
**Orders** — every order across all shops, filterable by in-progress or late.
**Shops** — open/close any outlet, edit commission and prep time, jump into any
shop console. **Operations** — fleet, battery, compartments, assigned
deliveries, incident log. **Terminal** — seats, flight board and rebasing.

Fleet control is read-only until the vendor interface exists; everything above
the fleet layer is live.

## Running it

Requires Docker (for local Supabase) and Node 20+.

```bash
cp .env.example .env.local     # fill in, or use the local values below
npx supabase start             # local Postgres, Auth, Realtime, Studio
npx supabase db reset          # applies migrations + seeds the terminal
node scripts/seed-staff.mjs    # creates a login for every shop
npm run dev
```

`npx supabase start` prints the local URL and keys. Put them in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from the start output>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from the start output>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Shop logins are `<slug>@shop.local` with the password `gatedelivery` —
for example `needstop@shop.local`. Development only.

Supabase Studio runs at http://127.0.0.1:54323.

### Against a hosted Supabase project

**Option A — the CLI (recommended).** Migration history is tracked, so later
changes apply as increments rather than a rewrite.

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Then seed the terminal and shops:

```bash
npx supabase db push --include-seed
```

**Option B — paste the SQL.** Two files in `supabase/setup/`, run in order in
the Supabase dashboard under **SQL Editor → New query**:

| File | What it does |
|---|---|
| `01_schema.sql` | Tables, functions, row-level security, realtime |
| `02_seed.sql` | The terminal, route graph, 288 QR-coded seats, shops, menus, flight board |

Both are generated from `supabase/migrations/` and verified against a clean
database. Run them on a **new, empty project** — they create tables rather than
alter them.

**Already ran the schema before the operations dashboard existed?** Don't
re-run `01_schema.sql`. Run `supabase/setup/03_upgrade_admin.sql` instead — it
adds flight-board rebasing and the whole admin layer, and is idempotent, so
running it twice changes nothing the second time.

Afterwards, create the shop logins against your cloud project:

```bash
SUPABASE_SERVICE_ROLE_KEY=<cloud service role key> \
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
node scripts/seed-staff.mjs
```

Then put the project URL and keys in `.env.local`.

> If you edit the schema later, change the files in `supabase/migrations/` —
> they are the source of truth. `supabase/setup/` is a convenience copy.

---

## The surfaces

| Path | Who | What |
|---|---|---|
| `/order` | Passenger | Choose a flight, set a delivery point, order, track |
| `/order/s/<token>` | Passenger | Seat QR deep link — the seat is already set |
| `/merchant/login` | Shop staff | Sign in |
| `/merchant/<slug>` | Shop staff | Orders, menu, preparation times, takings |

---

## Where a passenger says they are

Three ways, all resolving to one dispatchable target:

1. **Scan the QR on the seat** — the most precise. Each seat is surveyed, so we
   know its position and how far it is from the nearest point a unit can reach.
2. **Drop a pin on the terminal map** — snapped to the nearest reachable point.
3. **Pick a gate** — the fallback, and what a boarding pass pre-fills.

A robot navigates to surveyed waypoints; it cannot drive between rows of fixed
seating. So every location resolves to `nav_waypoint_id` plus `walk_metres`,
and the passenger is told the walking distance **before** they pay.

---

## Structure

```
src/
├── domain/        Pure business rules — no database, no framework
│   ├── spatial/   Route graph, shortest path, honest travel estimates
│   ├── orders/    The state machine
│   ├── acceptance/ Flight-aware acceptance: never promise what we cannot deliver
│   ├── pricing/   Commission and the three fiscal documents
│   └── fleet/     FleetAdapter interface + simulator
├── server/        Supabase-backed services (data, ordering, workflow)
├── lib/           Supabase clients, hooks, generated types
├── components/    The passenger app, the shop console, the terminal map
└── app/           Routes and the v1 API
supabase/
├── migrations/    Schema, functions, row-level security
└── seed.sql       The terminal, the shops, the seats
```

### Rules the code enforces

- **Prices come from the database.** The client sends product ids and
  quantities; every monetary value is recomputed server-side.
- **Order state moves through one place.** `src/server/workflow.ts` checks the
  state machine, and a database trigger writes the history so no path can skip it.
- **A mission never crosses a zone.** Sealed compartments are modelled as
  disconnected components of the route graph, so it is structurally impossible.
- **Age-restricted goods stay collect-in-store.** An unattended unit cannot
  verify age.
- **Three fiscal documents, never one.** The shop sells the goods, we sell the
  delivery, we invoice commission.

---

## Not built yet

| Area | Status |
|---|---|
| Robot dispatch | Missions are created and assigned; motion is simulated. Waiting on the vendor interface. |
| Payments | Mock provider. Set `STRIPE_SECRET_KEY` to switch. |
| Fiscalisation | Documents are recorded and marked simulated. Set `FISCAL_PROVIDER_API_KEY` to switch. |
| Live flight data | Seeded board. Set `FIDS_API_URL` to switch. |

Each is behind an environment variable, so a missing key degrades one
capability rather than breaking the build.

> The gate layout and walking distances are a reconstruction pending a survey
> with the airport. Shop names are the real operators.
