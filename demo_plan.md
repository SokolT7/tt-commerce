# Demo Plan — MZLZ Gate Delivery

**Status:** specification, not yet built
**Goal:** a running, multi-device demo you can drive yourself in a meeting with MZLZ, SDA Croatia or an investor — no robot, no airport access, no vendor API, no internet dependency.

---

## 1. What this demo has to prove

Four claims, in this order of importance:

1. **A passenger can order in under 60 seconds** from a gate seat, without installing anything.
2. **A shop can operate it with no training** — a tablet in the back of house, three taps per order.
3. **The system refuses what it cannot deliver.** Flight-aware acceptance is the thing that makes gate delivery trustworthy, and it is invisible unless you demonstrate the refusal.
4. **A robot closes the loop** — dispatched, tracked, arrived, handed over, with the compartment opening on a code.

Everything else in the build serves one of those four claims. If a feature doesn't, it waits for production.

### Audience-specific concerns to pre-empt

| Audience | What they are actually asking | Which screen answers it |
|---|---|---|
| MZLZ operations | "What happens when it goes wrong in my terminal?" | Ops console + the three injected failures |
| MZLZ commercial | "Where is the revenue and the data?" | Merchant commission statement + robot ad loop |
| SDA / merchants | "How much work is this for my staff?" | Merchant tablet, order-to-ready in three taps |
| Investor | "Is this real or a mockup?" | Two devices updating each other live |

---

## 2. Real vs simulated vs out of scope

**Stated aloud during the demo.** Naming the gaps is what makes the rest credible with an airport audience.

### Genuinely real (working software)
- Complete order state machine with every transition and exception branch
- Merchant catalogue management — create, edit, price, categorise, photo, modifiers, availability
- Live cross-device synchronisation: merchant taps accept, passenger's phone updates in the same second
- Flight-aware acceptance and refusal engine
- Delivery-point model on a real ZAG route graph
- Handover: single-use code, compartment release, confirmation
- Ops console with live fleet map, mission list, manual override, emergency hold
- Commission and takings calculation
- Robot screen with ad rotation and proof-of-play logging

### Simulated (and honest about it)
- **The robot** — `SimulatedFleetAdapter` walks a virtual Speedybot along the route graph at 1.2 m/s, emitting pose events every 500 ms
- **The flight board** — seeded ZAG departures with a live gate-change trigger
- **Payments** — mock authorisation by default; Stripe test mode behind an env flag
- **Wi-Fi zone confirmation** — stubbed, shown as a design placeholder

### Explicitly out of scope
Real FIDS feed · Croatian fiscalisation · e-invoicing · POS integration · Wi-Fi location · media booking back-office · real payment capture · multi-language · accessibility audit

> All six of the out-of-scope items are gated on a conversation with MZLZ or a vendor, not on engineering. Say this when asked.

---

## 3. Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js 15, App Router | One process, one command, five surfaces, deployable |
| Language | TypeScript, strict | Shared types across customer, merchant, ops and orchestrator |
| Styling | Tailwind CSS v4 | Fast, and three distinct surface treatments from one token set |
| State store | In-memory singleton behind repository interfaces | Zero install. Swap to Postgres in production without touching domain code |
| Real-time | Server-Sent Events (server→client), POST (client→server) | Native to Next route handlers; no custom server needed |
| Payments | Mock by default, Stripe test behind `STRIPE_ENABLED` | **Demo must run with no accounts and no internet** |
| Persistence | Optional JSON snapshot to disk | Survives a restart mid-meeting |

### Non-negotiable constraint

**The demo must run offline on a laptop with no external service reachable.** Conference-room Wi-Fi fails, and a demo that dies because Stripe is unreachable is worse than no demo. Everything external is behind a flag, defaulting to off.

---

## 4. Repository layout

```
tt-commerce/
├── demo_plan.md
├── Project_plan.md
├── src/
│   ├── domain/                 # survives into production untouched
│   │   ├── spatial/            # Zone, Waypoint, RouteEdge, graph traversal, ETA
│   │   ├── orders/             # state machine, transitions, guards
│   │   ├── acceptance/         # flight-aware acceptance engine
│   │   ├── pricing/            # commission, fees, ledger
│   │   └── fleet/
│   │       ├── FleetAdapter.ts        # the 11-method interface
│   │       ├── SimulatedAdapter.ts    # demo implementation
│   │       └── types.ts
│   ├── store/                  # repository interfaces + in-memory impl
│   ├── server/                 # route handlers, SSE hub, sim tick loop
│   ├── app/
│   │   ├── page.tsx            # launcher
│   │   ├── order/              # customer PWA
│   │   ├── merchant/           # merchant tablet
│   │   ├── ops/                # ops console
│   │   └── robot/              # robot kiosk screen
│   └── seed/                   # ZAG merchants, products, waypoints, flights
└── public/
```

`src/domain/` and `src/store/` interfaces are written to production standard. Everything in `src/app/` is demo-grade and expected to be rebuilt.

---

## 5. Seed data — real ZAG

### Merchants

**Airside Schengen (Zone 02 — the demo zone)**

| Merchant | Type | Demo catalogue |
|---|---|---|
| Aelia Duty Free | Travel retail | Croatian olive oil €18.90 · truffle spread €12.50 · Bajadera pralines €7.90 · sunscreen €14.50 · fragrance €62.00 · **spirits — marked pickup-only** |
| NeedStop | Mini-market | Cappuccino €2.80 · espresso €1.90 · ham & cheese toastie €5.50 · Caesar salad €7.90 · water 0.5 L €2.20 · croissant €2.40 |
| Apron View Restaurant | Sit-down | Club sandwich €11.50 · soup of the day €5.90 · fresh orange juice €4.50 |
| The Pub | Bar | Soft drinks €3.20 · crisps €2.80 · **draught beer — marked pickup-only** |
| Gate Café | Café | Flat white €3.10 · cortado €2.60 · almond croissant €3.40 |

**Landside (Zone 01 — shown but not orderable in v0)**
Café Nero · Tisak · Cakes & Bakes

> **The catalogue itself demonstrates a compliance rule.** Alcohol appears with a "collect in store — age verification required" badge rather than being hidden. That single detail answers the age-restriction question before anyone asks it.

### Spatial model

- **Zones:** landside, airside-schengen *(demo zone)*, airside-non-schengen, arrivals
- **Gates:** 1–14, with a non-Schengen subset marked. Confirmed real references: gates 4/5 and 12/13
- **Waypoints:** ~22 for the demo — 14 gate-area points, 5 merchant back-of-house doors, 2 docks, 1 holding point
- **Route graph:** hand-authored edges with distance in metres

> ⚠️ **Verify with MZLZ before the pilot:** exact gate numbering, the Schengen / non-Schengen gate split, and real walking distances. The demo graph is a plausible reconstruction, not a survey. Say so if asked directly.

### Flights
Six seeded ZAG departures across the next three hours with realistic boarding times, carriers and destinations — a mix of Schengen and non-Schengen so the zone rules are visible. One is deliberately close to boarding, to trigger the refusal case.

---

## 6. Order state machine

**Happy path**

```
DRAFT → VALIDATED → AUTHORIZED → SENT_TO_MERCHANT → ACCEPTED → PREPARING
  → READY → ROBOT_ASSIGNED → AT_MERCHANT → LOADED → IN_TRANSIT
  → ARRIVED → HANDED_OVER → COMPLETED
```

**Exception branches** — all implemented, three of them demo-triggerable

| Branch | Trigger | Behaviour |
|---|---|---|
| `REJECTED` | Merchant declines | Instant void, customer notified with reason |
| `GATE_CHANGED` | **Demo control** | Re-evaluate promise → reroute, or abort with refund |
| `NO_SHOW` | **Demo control** | Timeout → hold at waypoint → escalate to runner |
| `BLOCKED` | **Demo control** | Path obstructed → ops alert → auto-resume or intervene |
| `ROBOT_FAULT` | Fault injection | Manual recovery, order preserved |
| `SLA_MISSED` | Promise deadline passed | Automatic refund of the delivery fee |
| `EVACUATION` | Emergency hold button | All missions suspended, robots to safe points |
| `AGE_GATE_FAIL` | Restricted item | Return to shop, refund |

### Acceptance engine

```
deliverable_by = now
               + merchant_prep_time(merchant, items, queue_depth)
               + robot_eta(robot → merchant_waypoint)
               + loading_time
               + robot_eta(merchant_waypoint → delivery_waypoint)
               + handover_buffer

promise_deadline = boarding_time(flight) − safety_margin(zone)

ACCEPT  if deliverable_by <= promise_deadline
WARN    if within grace → offer store collection
REFUSE  otherwise, with the reason stated
```

Re-runs on every flight-board change for every in-flight order.

---

## 7. Fleet abstraction

The demo implements `SimulatedFleetAdapter` against the eleven-method interface from the architecture document. **Write the interface first, the simulator second, and nothing above the interface knows a robot is fake.**

Simulator behaviour:
- Traverses route-graph edges at 1.2 m/s, interpolating position
- Emits `pose` every 500 ms, `arrived`, `blocked`, `compartment_opened`, `battery`, `fault`
- Accepts multi-stop missions with a compartment plan
- Honours `emergencyHold(zone)` immediately
- Battery drains at a plausible rate and returns to dock below 15%
- Fault injection API for the demo controls

> **Send Alpha Robotics the interface.** Ask which of the eleven methods they support rather than waiting for documentation. It turns the missing API into a procurement question you control.

---

## 8. Surfaces

### 8.1 Launcher — `/`
Not part of the story, but it makes the demo runnable. QR codes linking each device to its surface, a device-role picker, and the demo control panel: inject gate change, inject no-show, inject blocked path, reset scenario, jump clock forward.

### 8.2 Customer PWA — `/order` *(mobile-first)*

| Screen | Content | Acceptance criterion |
|---|---|---|
| Entry | QR deep link `/order/wp/G07-A` — delivery point pre-filled, no login | Reaches catalogue in one tap |
| Boarding pass | Scan or pick a demo flight → flight, gate, destination, boarding time, countdown | Gate pre-selects the delivery point |
| Catalogue | Merchants with walking distance and prep time; pickup-only badges on restricted items | Browsable in under 10 s |
| Cart | Items, delivery fee, total, promise time | Shows *"arrives by 07:42 — 31 min before boarding"* |
| Delivery point | Map with waypoints, landmark photo, walking description; adjustable | Confirms or changes in two taps |
| Checkout | Mock payment sheet; wallet-style UI | Completes in under 5 s |
| Tracking | Live robot position, counting ETA, state timeline, sponsor slot | Updates within 1 s of any state change |
| Arrival | Push-style banner, landmark name, "I'm here" | Fires at 30 s out |
| Handover | 4-digit code, large type | Code entry on the robot opens the compartment |
| Complete | Receipt, rating | Merchant sees the commission line immediately |
| **Refusal** | *"Boarding in 18 min — too tight. Collect in store, ready in 6?"* | Reached by ordering against the tight flight |

### 8.3 Merchant tablet — `/merchant/[id]` *(landscape)*

| Screen | Content | Acceptance criterion |
|---|---|---|
| Products | List, add, edit — name, price, category, photo, modifiers, allergens | New product live in the customer catalogue within 1 s |
| Availability | Per-item toggle; "86 this item" | Disappears from customer catalogue immediately |
| Prep time | Default and per-hour override | Feeds the acceptance engine visibly |
| Order queue | Incoming card with countdown, items, gate, promise deadline | Audible + visual alert on arrival |
| Accept / reject | Two large buttons, reason picker on reject | One tap |
| Prepare | Preparing → Ready, timer against declared prep time | Customer tracking reflects each transition |
| Load | *"Load compartment 3"* with scan-to-confirm | Robot departs only after confirmation |
| Takings | Orders, gross, commission, net payout | Reconciles with the customer receipts |

### 8.4 Ops console — `/ops` *(desktop)*
Live terminal map with robot positions and mission paths · mission list with states and ETAs · manual override (recall, reroute, open compartment) · incident log · fleet health (battery, faults, docks) · **emergency hold** · demo failure injection.

**This is the screen that reassures MZLZ.** Give it more polish than its share of the story suggests.

### 8.5 Robot screen — `/robot/[id]` *(tablet, kiosk)*
Idle → ad loop · In transit → ad loop plus *"delivering to gate 7"* · Arrived → order reference and code entry · Opened → compartment animation, "please take your order" · Complete → thank you, returns to ad loop. Proof-of-play logged per exposure.

---

## 9. Demo script (~7 minutes)

| Time | Action | What it proves |
|---|---|---|
| 0:00 | Three devices: phone `/order`, tablet `/merchant/needstop`, tablet `/robot/r1`. Ops console on the laptop | It's a system, not a screen |
| 0:30 | Scan the gate 7 seat QR on the phone | Zero-friction entry, no download |
| 1:00 | Pick the demo boarding pass — flight, gate, boarding countdown appear | Flight awareness is real |
| 1:30 | Add cappuccino + toastie. Point out the spirits marked pickup-only | Compliance designed in, not bolted on |
| 2:00 | Confirm delivery point — landmark photo, walking description | Honest about the 5–10 m walk |
| 2:15 | Checkout. Promise: *"arrives by 07:42, 31 min before boarding"* | The promise is computed, not decorative |
| 2:30 | **Look at the merchant tablet** — order already there, counting down. Accept | Live cross-device sync — the moment that lands |
| 3:00 | Preparing → Ready → *"Load compartment 3"*, scan to confirm | Three taps, no training |
| 3:30 | Robot dispatched. Phone shows live ETA; robot screen plays the ad | Media inventory made concrete |
| 4:15 | **Inject gate change 7 → 11.** Watch the reroute and the passenger notification | The failure that kills gate delivery, handled |
| 5:00 | Robot arrives, banner fires, enter the code, compartment opens | Loop closed |
| 5:30 | Merchant takings show the commission line | Revenue model made concrete |
| 6:00 | **The refusal** — order against the flight boarding in 12 minutes. Declined, store collection offered | Trustworthiness |
| 6:45 | Ops console: fleet map, incident log, press **emergency hold** | The answer to "what if it goes wrong in my terminal" |

Rehearse it. A demo that needs narration to cover a gap is worse than a shorter demo.

---

## 10. Build sequence

| WP | Scope | Done when |
|---|---|---|
| **WP1** | Spatial model, route graph, ETA engine, `FleetAdapter` interface, simulator, SSE hub | A virtual robot can be dispatched between any two waypoints with an honest ETA |
| **WP2** | Order state machine, acceptance engine, repositories, seed data, ledger | A full order runs end to end via API calls, no UI |
| **WP3** | Customer PWA — all screens including refusal | A passenger completes an order on a phone |
| **WP4** | Merchant tablet — catalogue, queue, prep, load, takings | A shop runs an order start to finish on a tablet |
| **WP5** | Ops console + robot screen + ad loop | The three failures can be injected and resolved |
| **WP6** | Launcher, demo controls, seed reset, offline hardening, rehearsal pass | The full 7-minute script runs twice without intervention |

**WP1 and WP2 are production code.** WP3–WP6 are demo-grade and expected to be rebuilt against the production spec.

---

## 11. Definition of done

- [ ] `npm run dev`, open five URLs, no other setup
- [ ] Runs fully offline — airplane mode on the laptop
- [ ] Survives a restart mid-demo without losing the scenario
- [ ] Full script completes twice consecutively without intervention
- [ ] All three failure injections work from the ops console
- [ ] Refusal case reachable and clearly explained on screen
- [ ] Two devices demonstrably update each other within 1 second
- [ ] Reset returns to a clean state in one click
- [ ] No placeholder text, no lorem, no "Merchant A"
- [ ] Known gaps written on the launcher page so you can point at them

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Conference Wi-Fi fails | Everything local; external services flagged off by default |
| Someone asks about real gate numbers | Say plainly that the graph is a reconstruction pending MZLZ survey |
| "Is this a mockup?" | Hand them a device and let them order |
| Demo state gets messy mid-meeting | One-click reset on the launcher |
| Over-promising seat-side delivery | Delivery-point screen shows the landmark and the walk explicitly |
| Scope creep into production features | WP3–WP6 are explicitly disposable; resist adding to them |
