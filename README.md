# Gate Delivery — ZAG demo

A working, multi-device demo of in-terminal ordering and robot delivery at
Franjo Tuđman Airport. No robot, no airport access, no vendor API, no internet
dependency once installed.

Specs: [`demo_plan.md`](demo_plan.md) · [`Project_plan.md`](Project_plan.md)

---

## Run it

```bash
npm run dev
```

Then open the launcher at **http://localhost:3000** — it lists every surface.

| Surface | URL | Device |
|---|---|---|
| Launcher & demo notes | `/` | Laptop |
| Customer | `/order` — or `/order/wp/G07-A` to simulate a seat QR | Phone |
| Merchant | `/merchant/needstop` | Tablet, landscape |
| Operations | `/ops` | Laptop |
| Robot screen | `/robot/SB-01` | Second tablet |

To run it across real devices on the same Wi-Fi, use the network address that
`npm run dev` prints instead of `localhost`.

**The demo lands when the surfaces are on separate screens.** Accept an order on
the merchant tablet and the passenger's phone updates in the same second — that
is the thing worth showing.

### Offline

Everything runs locally with no external service. The one exception is the
**first** `npm run dev`, which fetches the Archivo and IBM Plex Mono webfonts
and then self-hosts them. Start it once with a connection; after that it runs in
airplane mode.

---

## What is real, simulated, and out of scope

Say this out loud in a demo — naming the gaps is what makes the rest credible.

**Real** — the order state machine and every exception branch, flight-aware
acceptance and refusal, catalogue management, live cross-device sync, the
delivery-point model on a route graph, code-based handover, commission and the
three-document fiscal split, ops console, incident log.

**Simulated** — the robot (a virtual Speedybot walking the route graph at
1.2 m/s), the flight board, payments.

**Reconstructed** — the gate layout and walking distances. Confirmed real: gates
4/5 and 12/13 exist and a Schengen / non-Schengen split runs through departures
airside. Everything else needs an MZLZ survey.

**Out of scope** — live FIDS, Croatian fiscalisation, POS integration, Wi-Fi
location, media booking back-office, multi-language, accessibility audit. All of
these are gated on a conversation with MZLZ or a vendor, not on engineering.

---

## The seven-minute script

1. **Phone** — scan gate 7 (`/order/wp/G07-A`), pick flight OU 654, order a
   cappuccino and a toastie.
2. Point out the spirits at Aelia and the draught beer at The Pub, marked
   *collect in store*. The catalogue enforces the age rule.
3. **Merchant tablet** — the order is already there, counting down. Accept →
   Mark ready → Load compartment.
4. **Robot screen** plays its ad loop while it drives; the phone shows a live ETA.
5. **Ops console** — inject a gate change. Watch it reroute and notify the passenger.
6. Robot arrives. Enter the 4-digit code from the phone. Compartment opens.
7. Order against **LH 1727** (boards in 12 minutes) — refused, store collection
   offered instead.

Rehearse it. A demo that needs narration to cover a gap is worse than a shorter demo.

The ops console also injects a **blocked path** and a **passenger no-show**, and
has an **emergency hold** that stops the fleet. Reset the scenario from the
launcher or the ops console at any time.

---

## Architecture

```
src/
├── domain/            ← production code. Survives into the real platform.
│   ├── types.ts           shared domain types
│   ├── spatial/           route graph, Dijkstra, honest ETAs
│   ├── orders/            state machine, transitions, guards
│   ├── acceptance/        flight-aware acceptance engine
│   ├── pricing/           commission, fees, the three fiscal documents
│   └── fleet/
│       ├── adapter.ts     ← THE interface. 12 methods.
│       └── simulated.ts   ← the demo, and the permanent CI test harness
├── store/             repository interfaces + in-memory implementation
├── server/            engine (orchestration), SSE bus
├── seed/              real ZAG merchants, products, terminal, flights
├── components/        the four surfaces
└── app/               routes and API handlers
```

### The one idea that matters

`FleetAdapter` is the seam. Three implementations sit behind it:

- `SimulatedAdapter` — this demo, and later the CI regression harness
- `CourierAdapter` — a human runner with a phone (production Release 1)
- `AlphaAdapter` — Suzhou Alpha Robotics Speedybot Max (production Release 3)

A runner consumes a mission exactly as a robot does: go to the shop, collect
into a compartment, travel to a waypoint, hand over on a code. So the human-first
launch and the robot fleet share one orchestration core, and Release 3 swaps an
implementation rather than rewriting the product.

**Send this interface to Alpha Robotics** and ask which of the twelve methods
they support, rather than waiting on their documentation.

---

## Development notes

**Restart the dev server after changing anything under `src/domain` or
`src/server`.** The engine is a singleton pinned to `globalThis` so it survives
hot reloads and keeps demo state across UI edits — which also means hot reload
will happily keep running the *old* domain code. UI edits under `src/app` and
`src/components` hot-reload normally.

Type-check and lint:

```bash
npx tsc --noEmit && npx eslint src
```

### Swapping the in-memory store for a database

Everything goes through `Repository<T>` in `src/store/memory.ts`. Implement the
same interface against Postgres and the domain does not change.

### Known simplifications

- State lives in memory. Restarting the server clears orders; the flight board
  rebuilds relative to the restart. The customer surface keeps its session in
  `localStorage`, so a phone refresh mid-demo does not lose the order.
- Availability is a boolean toggle, not a stock count. Shops will not maintain
  inventory in v1.
- The prep-time model is declared-plus-hour-of-day. Production learns it from
  measured accept-to-ready durations.
