# Project Plan — MZLZ Gate Delivery Platform

**Status:** production specification
**Companions:** `demo_plan.md` (the v0 demo) · MZLZ Venture Blueprint · Gate Delivery Platform Architecture

---

## 1. What we are building

A three-sided marketplace operating inside Franjo Tuđman Airport: passengers order from terminal shops, shops fulfil, and a dispatch layer delivers to the passenger's location — first by human runner, later by autonomous robot. The company is the **technology platform and licensed in-terminal logistics operator**. It never sells goods; the shop stays merchant of record.

### The architectural decision that shapes everything

**The delivery mechanism is an implementation detail behind one interface.**

```
                      ┌─────────────────────┐
                      │    FleetAdapter     │   11 methods
                      └──────────┬──────────┘
              ┌──────────────────┼──────────────────┐
    CourierAdapter        SimulatedAdapter      AlphaAdapter
   (runner's phone)         (dev + demo)      (Speedybot Max)
       Release 1            all releases         Release 3
```

The venture strategy is human-first, robots second. Naively that implies building a courier product and then rebuilding it for robots. It does not. A human runner with a phone consumes missions exactly as a robot does: receive assignment, go to merchant, collect into a compartment, travel to waypoint, hand over on code. **One orchestration core, three adapters.** Release 3 swaps an implementation; it does not rewrite the product.

---

## 2. Release plan

Aligned to the venture blueprint's commercial phases.

| Release | Commercial phase | Delivery mechanism | Core additions |
|---|---|---|---|
| **v0** | Phase 0 — permission | Simulated | The demo. Wins the MZLZ term sheet and merchant LOIs |
| **v1** | Phase 1 — human launch | `CourierAdapter` | Real payments, fiscalisation, live FIDS, merchant onboarding, runner app. **Revenue-generating** |
| **v1.5** | Phase 1 — scale | `CourierAdapter` | Media plane, affiliate services, B2B crew ordering, analytics for merchants and MZLZ |
| **v2** | Phase 2 — follower robot | `CourierAdapter` + cargo unit | Follower robot carried on the courier mission; multi-order batching |
| **v3** | Phase 2/3 — autonomy | `AlphaAdapter` | Fleet management, teleop console, safety interlocks, evacuation integration, charging orchestration |
| **v4** | Phase 3 — expansion | Multi-adapter | Zone 03 via transfer hatch, age verification, lockers, reserve & collect |
| **v5** | Phase 4 — replication | — | Multi-tenant, multi-airport, white-label theming |

> **v1 is the commercial product, not a stepping stone.** It must be built to production standard: real money, real receipts, real passengers, real merchants. Everything after it is additive.

---

## 3. System architecture

Seven planes, deployed as a **modular monolith** with one exception. Do not start with microservices; the team is small and the domain boundaries are still moving.

| Plane | Module | Deployment |
|---|---|---|
| 1 Customer | `web/customer` | EU cloud |
| 2 Merchant | `web/merchant` | EU cloud |
| 3 Orchestration | `core/orders`, `core/acceptance`, `core/dispatch` | EU cloud |
| 4 Fleet abstraction | `fleet/*` | **Edge — MZLZ data centre** |
| 5 Integration | `integrations/*` | Split by dependency |
| 6 Media | `media/*` | EU cloud + CDN |
| 7 Data | `data/*` | EU cloud |

### The one thing that must run on-site

The **fleet controller** runs in MZLZ's own data centre, on colocation their ICT catalogue already offers and their policy already requires. Reasons, in order:

1. A robot must not depend on a WAN link to decide whether to stop.
2. Evacuation holds must execute in milliseconds, locally.
3. Robot telemetry stays inside the airport network boundary.
4. Store-and-forward keeps deliveries running through a cloud outage.

Everything else — ordering, catalogue, payments, analytics — sits in an EU cloud region (Frankfurt or Milan), stated plainly in the DPIA.

---

## 4. Domain model

### Bounded contexts

| Context | Owns | Never owns |
|---|---|---|
| **Spatial** | Zones, waypoints, route graph, delivery points, QR estate, traversal and ETA | Anything about orders |
| **Catalogue** | Merchants, products, variants, modifiers, availability, prep-time profiles | Prices at time of sale (that's Orders) |
| **Identity** | Sessions, customers, boarding passes, consents | Payment credentials |
| **Orders** | Order lifecycle, promise, line snapshots, refunds | How delivery physically happens |
| **Dispatch** | Missions, stops, compartment assignment, batching, handover tokens | Robot internals |
| **Fleet** | Robots, couriers, docks, battery, faults, maintenance | Order semantics |
| **Money** | Payments, captures, fiscal documents, commission ledger, payouts, airport share | — |
| **Media** | Advertisers, campaigns, creatives, placements, proof-of-play | Order data beyond aggregate |
| **Insight** | Event log, rollups, incrementality cohorts, dashboards | Mutable state |

### Financial modelling — three separate documents

The single most consequential data decision. Under Croatian Fiscalization 2.0, retrofitting this split means redoing every ledger entry under audit.

| Document | Issued by | To | Type |
|---|---|---|---|
| Fiscal receipt for goods | **The merchant's system** | Passenger | Their B2C, real-time fiscalised |
| Fiscal receipt for delivery fee | **Us** | Passenger | Our B2C, real-time fiscalised |
| Commission invoice | **Us** | Merchant | B2B e-invoice, EN 16931 / HR-FISK 2.0 |
| Airport share invoice | **Us** | MZLZ | B2B e-invoice, EN 16931 / HR-FISK 2.0 |

### Promise as a first-class entity

`Promise` records the quoted deadline **and every input used to compute it** — prep estimate, robot ETA, route, flight state at quote time. Needed to adjudicate SLA refunds, to improve the prep-time model, and to defend a disputed refund with a merchant.

---

## 5. Service surfaces

### Public API (customer + merchant)
REST over HTTPS, JSON, versioned `/api/v1`. Idempotency keys on all mutations. SSE for order tracking; WebSocket only if SSE proves insufficient.

### Fleet API (edge ↔ cloud)
mTLS between edge and cloud. Missions pushed cloud→edge; telemetry and events streamed edge→cloud with store-and-forward. **The edge must complete an in-flight mission with the cloud unreachable.**

### Internal
Module boundaries enforced by an import linter, not by network calls. Extract a service only when a real scaling or ownership reason appears.

---

## 6. Integrations

| Integration | Owner | Lead time | Blocking for |
|---|---|---|---|
| **FIDS** — live flight status, gate, boarding, changes | MZLZ IT | Long — request in Phase 0 | v1. Nothing works without it |
| **Payments** — marketplace split settlement, 3DS, wallets | Stripe Connect / Adyen | Medium — verify Croatian acquiring | v1 |
| **Fiscalisation + e-invoicing** — real-time B2C, EN 16931 via certified access point | Croatian fiscal provider | Medium | v1 |
| **Wi-Fi captive portal** — entry-point placement, session→zone lookup | MZLZ IT | Medium | v1.5 |
| **Fire alarm / evacuation signal** | MZLZ safety | Long | **v3 — hard gate on autonomy** |
| **Airport ops centre feed** — read-only robot positions, incidents | Us → MZLZ | Short | v3. Cheap to build, buys enormous trust |
| **Lifts and doors** — Alpha IoT module, physically installed | MZLZ + lift OEM | Long | v4 only. Keep v1–v3 single-level |
| **Merchant POS** | Merchant / POS vendor | Long | v2+. Never let this block launch |
| **Alpha fleet API** | Alpha Robotics | Unknown — **requested, not received** | v3 |

### Alpha Robotics — open procurement questions

Send them the `FleetAdapter` interface and ask which methods they support. Contractual gates before any hardware commitment:

1. **EU Declaration of Conformity with the harmonised standards list.** Catalogue "CE" typically covers EMC, radio and low voltage — not machinery. **Regulation (EU) 2023/1230 applies from 20 January 2027, covers autonomous mobile machinery explicitly, no grace period.** Require conformity as a supply-contract warranty.
2. **Open API, EU-hosted or on-premise.** China-hosted-only dispatch is a project-ending GDPR transfer problem.
3. **Android openness** — third-party APK on the robot screen. This is the media revenue surface, not a UI preference.
4. **European service, spares stock, uptime SLA.**
5. **Missing specs:** Speedybot Max footprint, weight, turning radius, ramp and gap tolerance, IP rating, configurable speed limits.
6. UN 38.3 battery documentation; charging-station fire approval for MZLZ.

**Selected unit:** Speedybot Max, 6 compartments. Compartment count is an economics decision — batching three to four orders per loop is the gap between the break-even model and a losing one.

---

## 7. Non-functional requirements

| Requirement | Target | Why this number |
|---|---|---|
| Order placement p95 | < 2.5 s | Passenger is standing, distracted, on airport Wi-Fi |
| State propagation to all surfaces | < 1 s | The cross-device moment is the product |
| Tracking screen update | ≤ 1 s | Sustained attention — this is premium ad inventory |
| Customer PWA availability | 99.5% during operating hours | Below that, merchants stop trusting the tablet |
| Edge fleet controller availability | 99.9% | Safety-adjacent |
| Emergency hold latency | < 500 ms, local | Non-negotiable safety gate |
| Offline tolerance, customer | Tracking survives 60 s of network loss | Terminal Wi-Fi is unreliable |
| Offline tolerance, edge | Completes in-flight missions with cloud down | Store-and-forward |
| On-time delivery | > 95% against promise | The commercial KPI |
| PCI scope | SAQ-A — hosted fields, card data never touches us | Keeps audit burden minimal |

---

## 8. Compliance engineering

Requirements that must be built, not merely documented.

| Area | Engineering obligation |
|---|---|
| **Fiscalization 2.0** | Real-time B2C fiscalisation of our delivery fee; structured e-invoices (EN 16931 + HR-FISK 2.0 CIUS) via a certified access point registered in the AMS directory. Retry and reconciliation for fiscalisation outages — the sale still happened |
| **PSD2** | Split settlement so funds never rest with us as principal. The commercial-agent exemption is too narrow to build on |
| **GDPR** | DPIA before pilot. Granular timestamped consent (location, marketing, analytics). Retention schedule with automated deletion. Data-sharing agreements with MZLZ and merchants. Robot cameras are surveillance-grade processing: signage, retention limits, **no facial recognition** |
| **ePrivacy Art. 5(3)** | No passive device tracking of non-consenting passengers. Location strictly first-party, session-scoped, consented |
| **EU AI Act** | No real-time biometric identification in publicly accessible spaces. Any CV limited to non-identifying crowd density |
| **Aviation security (EU 2015/1998)** | Badged staff — background checks and training, **months of lead time, start in Phase 0**. Robot SRA access authorisation and marking. Goods entering the SRA from landside require screening or known-supplier designation, re-validated every 2 years |
| **Machinery (EU 2023/1230)** | Vendor conformity warranty; safety file retained |
| **Age-restricted goods** | v1–v3: excluded from delivery, offered as store collection. v4: attended handover or verified ID check |
| **Food safety** | HACCP stays with the merchant; we own transit conditions and maximum transit time, logged per order |

---

## 9. Security

- mTLS between edge and cloud; certificate rotation automated
- Role-based access: customer, merchant staff, merchant admin, runner, ops, admin
- Merchant tablets enrolled in MDM, kiosk-locked
- Handover tokens: single-use, short-lived, rate-limited, never guessable
- Compartment-open events immutably logged with actor attribution
- Secrets in a managed vault, never in the repo
- Dependency and container scanning in CI
- Annual penetration test before the MZLZ security review
- Incident response runbook agreed with MZLZ's security manager

---

## 10. Environments and delivery

| Environment | Purpose | Fleet adapter |
|---|---|---|
| `local` | Development | Simulated |
| `ci` | Automated tests | Simulated, deterministic clock |
| `staging` | Integration, merchant training | Simulated + FIDS sandbox |
| `terminal-staging` | On-site, one robot, out of hours | Alpha, restricted zone |
| `production` | Live | Courier and/or Alpha |

**CI/CD:** trunk-based, feature flags over long branches. Every merge runs unit, integration and simulation-based end-to-end tests. Cloud deploys continuously; **edge deploys are scheduled, versioned and manually gated** — you do not push to a robot controller at 07:00 on a Monday.

---

## 11. Testing

| Layer | Approach |
|---|---|
| Unit | Domain logic — state machine transitions and guards, acceptance engine, ETA, ledger |
| Property-based | State machine invariants: no order reaches `COMPLETED` without `HANDED_OVER`; no mission crosses a zone |
| Integration | Repositories, payments sandbox, fiscalisation sandbox, FIDS fixtures |
| **Simulation E2E** | Full order lifecycles against `SimulatedAdapter` with a deterministic clock. **This is the primary regression suite** — it runs in CI with no hardware |
| Fault injection | Gate change, no-show, blocked path, robot fault, cloud partition, fiscalisation outage, merchant non-response |
| Load | Peak bank simulation — the morning wave, not an even average |
| Field acceptance | On-site, out of hours: waypoint accuracy, handover ergonomics, evacuation hold, battery cycle |

**Test the failures harder than the happy path.** In a terminal, the happy path takes care of itself and the exceptions are what MZLZ will judge you on.

---

## 12. Observability and operations

- OpenTelemetry traces spanning customer → orchestration → edge → robot
- Business dashboards: attach rate, on-time %, orders per robot-hour, revenue mix
- Fleet dashboards: uptime, interventions per 100 km, battery, dock occupancy
- Alerting tiered: safety → immediate page; SLA breach → ops; commercial anomaly → daily

**Runbooks required before pilot:** robot blocked · robot flagged as unattended item · evacuation · merchant offline mid-order · payment provider outage · fiscalisation outage · cloud partition · passenger complaint escalation · injury or near-miss.

The unattended-item runbook matters more than it sounds. A stationary machine with a locked bin in a security restricted area is, to a security officer, an abandoned item — and the mitigation is procedural, not technical.

---

## 13. Team

| Role | v0–v1 | v3+ |
|---|---|---|
| Full-stack engineers | 2 | 3–4 |
| Robotics / integration engineer | — | 1 |
| Product / ops lead | 1 (founder) | 1 |
| Terminal operations lead (badged) | — | 1 |
| Runners / robot attendants (badged) | 2–3 | 3–5 |
| Merchant success | 0.5 | 1 |
| Compliance / legal | External | External + internal owner |

Badging has months of lead time. **Start it in Phase 0, before development.**

---

## 14. Milestones and gates

| # | Milestone | Gate to pass |
|---|---|---|
| M0 | Demo complete | Runs the 7-minute script twice unattended |
| M1 | MZLZ term sheet + 4 merchant LOIs | Exclusivity, term, revenue share, **media carve-out**, double-fee resolution |
| M2 | FIDS access granted | Live feed in staging |
| M3 | Payments + fiscalisation live | A real euro moves, correctly documented |
| M4 | v1 launch, human couriers | 20 consecutive days above 95% on-time |
| M5 | Commercial validation | Order volume ≥ conservative case; two merchants asking to expand range |
| M6 | Alpha contract signed | All six procurement gates cleared |
| M7 | Field acceptance, one robot | Zero safety incidents; security manager sign-off |
| M8 | v3 autonomous operation | Robot cost per delivery below runner cost per delivery |
| M9 | Zone 03 via transfer hatch | Border-police procedure agreed |
| M10 | Second airport | Multi-tenant proven |

---

## 15. Technical risks

| Risk | Impact | Mitigation |
|---|---|---|
| Alpha API inadequate — no multi-stop, no remote compartment control, no push telemetry, or China-only hosting | Vendor change late | **Interface first.** Send them the spec now; qualify a second vendor before hardware commitment |
| FIDS access delayed or refused | v1 cannot launch | Raise in the first MZLZ meeting; interim fallback is manual flight entry, degraded but shippable |
| Media rights already exclusively concessioned | Revenue model does not close | Term-sheet issue, not technical. Resolve at M1 before building the media plane |
| Fiscalisation provider integration harder than expected | Launch slip | Pick the provider early; it shapes the financial data model |
| Prep-time estimates wrong at peak | On-time % collapses | Learned per-hour model from day one; conservative initial margins |
| Waypoint survey invalidated by terminal changes | Routes break | Treat the survey as recurring maintenance, not a one-off |
| Edge/cloud partition during a bank | Deliveries stall | Store-and-forward; edge completes in-flight missions autonomously |
| Terminal Wi-Fi unreliable for customers | Tracking looks broken | Offline-tolerant PWA; degrade to polling; cache aggressively |
| Scope creep from demo into v1 | Slip | v0 UI is explicitly disposable; only `domain/` and `store/` carry forward |

---

## 16. Open dependencies

Blocking, and owned outside engineering:

1. **Alpha API documentation** — requested, not received. Send the interface spec as the counter-ask.
2. **FIDS feed format and access** — MZLZ IT.
3. **Real gate numbering and the Schengen / non-Schengen split** — the demo graph is a reconstruction.
4. **Media rights carve-out** — MZLZ commercial.
5. **Concession-fee treatment of delivered orders** — the double-fee trap; MZLZ commercial.
6. **Badge process initiation** — MZLZ security. Longest lead time in the project.
7. **Croatian PSP selection** — verify local acquiring and wallet coverage.
8. **Fiscalisation provider selection** — shapes the money model.

---

## 17. From demo to production

What survives, what does not.

| Demo asset | Fate |
|---|---|
| `domain/spatial` | **Keep** — replace demo graph with surveyed waypoints |
| `domain/orders` state machine | **Keep** — production from day one |
| `domain/acceptance` | **Keep** — swap mock flight board for FIDS |
| `fleet/FleetAdapter` interface | **Keep** — the whole point |
| `fleet/SimulatedAdapter` | **Keep forever** — it becomes the CI test harness |
| `store/` interfaces | **Keep** — swap in-memory for Postgres |
| Seed data | Keep structure, replace content with surveyed reality |
| `app/` UI | **Rebuild** against production specs, accessibility and multi-language |
| Mock payments | Replace with PSP + fiscalisation |

The simulator is not scaffolding to be thrown away. It becomes the permanent regression harness that lets you test the whole platform in CI without a robot — which is exactly why it gets built first.
