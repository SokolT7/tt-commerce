import type { Merchant, Product } from "@/domain/types";

/**
 * Real ZAG operators. No "Merchant A".
 *
 * Age-restricted lines stay IN the catalogue, marked collect-in-store, because
 * the catalogue itself should demonstrate the compliance rule: an unattended
 * unit cannot verify age, so spirits and draught beer are pickup-only.
 */

export const MERCHANTS: Merchant[] = [
  {
    id: "needstop",
    name: "NeedStop",
    kind: "market",
    zone: "airside-schengen",
    waypointId: "M-NEEDSTOP",
    blurb: "Mini-market — sandwiches, salads, coffee and snacks",
    prepMinutes: 4,
    prepByHour: { 6: 7, 7: 8, 8: 7, 17: 6, 18: 6 },
    commissionRate: 0.15,
    open: true,
    colour: "#0E6E5C",
  },
  {
    id: "gatecafe",
    name: "Gate Café",
    kind: "cafe",
    zone: "airside-schengen",
    waypointId: "M-GATECAFE",
    blurb: "Espresso bar between gates 3 and 4",
    prepMinutes: 3,
    prepByHour: { 6: 6, 7: 7, 8: 6 },
    commissionRate: 0.15,
    open: true,
    colour: "#B4761A",
  },
  {
    id: "aelia",
    name: "Aelia Duty Free",
    kind: "retail",
    zone: "airside-schengen",
    waypointId: "M-AELIA",
    blurb: "Travel retail — Croatian specialities, beauty, confectionery",
    prepMinutes: 6,
    commissionRate: 0.11,
    open: true,
    colour: "#6A4A6E",
  },
  {
    id: "apron",
    name: "Apron View Restaurant",
    kind: "restaurant",
    zone: "airside-schengen",
    waypointId: "M-APRON",
    blurb: "Sit-down dining with views over the apron",
    prepMinutes: 9,
    prepByHour: { 7: 12, 8: 12, 12: 14, 13: 14 },
    commissionRate: 0.15,
    open: true,
    colour: "#3D5A73",
  },
  {
    id: "pub",
    name: "The Pub",
    kind: "bar",
    zone: "airside-schengen",
    waypointId: "M-PUB",
    blurb: "Bar and snacks by gates 4 and 5",
    prepMinutes: 4,
    commissionRate: 0.15,
    open: true,
    colour: "#A8332B",
  },
  // Landside — shown in the zone model, not orderable in v0
  { id: "cafenero", name: "Café Nero", kind: "cafe", zone: "landside", waypointId: "M-CAFENERO", blurb: "Departures hall — open from 04:30", prepMinutes: 4, commissionRate: 0.15, open: true, colour: "#6E7570" },
  { id: "tisak", name: "Tisak", kind: "market", zone: "landside", waypointId: "M-TISAK", blurb: "Newsagent — drinks, snacks, SIM cards", prepMinutes: 3, commissionRate: 0.12, open: true, colour: "#6E7570" },
  { id: "cakes", name: "Cakes & Bakes", kind: "cafe", zone: "landside", waypointId: "M-CAKES", blurb: "Bakery — fresh pastries and bread", prepMinutes: 3, commissionRate: 0.15, open: true, colour: "#6E7570" },
];

export const PRODUCTS: Product[] = [
  // NeedStop
  { id: "ns-cappuccino", merchantId: "needstop", name: "Cappuccino", description: "Double shot, whole or oat milk", category: "hot-drinks", priceCents: 280, available: true, ageRestricted: false, emoji: "☕" },
  { id: "ns-espresso", merchantId: "needstop", name: "Espresso", description: "Single shot", category: "hot-drinks", priceCents: 190, available: true, ageRestricted: false, emoji: "☕" },
  { id: "ns-toastie", merchantId: "needstop", name: "Ham & cheese toastie", description: "Pressed, served hot", category: "food", priceCents: 550, available: true, ageRestricted: false, allergens: ["gluten", "dairy"], emoji: "🥪" },
  { id: "ns-caesar", merchantId: "needstop", name: "Caesar salad", description: "Chicken, parmesan, croutons", category: "food", priceCents: 790, available: true, ageRestricted: false, allergens: ["gluten", "dairy", "egg", "fish"], emoji: "🥗" },
  { id: "ns-water", merchantId: "needstop", name: "Still water 0.5 L", description: "Jana", category: "cold-drinks", priceCents: 220, available: true, ageRestricted: false, emoji: "💧" },
  { id: "ns-croissant", merchantId: "needstop", name: "Butter croissant", description: "Baked this morning", category: "food", priceCents: 240, available: true, ageRestricted: false, allergens: ["gluten", "dairy"], emoji: "🥐" },

  // Gate Café
  { id: "gc-flatwhite", merchantId: "gatecafe", name: "Flat white", description: "Double ristretto, silky milk", category: "hot-drinks", priceCents: 310, available: true, ageRestricted: false, emoji: "☕" },
  { id: "gc-cortado", merchantId: "gatecafe", name: "Cortado", description: "Equal parts espresso and milk", category: "hot-drinks", priceCents: 260, available: true, ageRestricted: false, emoji: "☕" },
  { id: "gc-almond", merchantId: "gatecafe", name: "Almond croissant", description: "Filled and toasted", category: "food", priceCents: 340, available: true, ageRestricted: false, allergens: ["gluten", "dairy", "nuts"], emoji: "🥐" },
  { id: "gc-orange", merchantId: "gatecafe", name: "Fresh orange juice", description: "Squeezed to order", category: "cold-drinks", priceCents: 420, available: true, ageRestricted: false, emoji: "🍊" },

  // Aelia Duty Free
  { id: "ae-oliveoil", merchantId: "aelia", name: "Croatian olive oil 500 ml", description: "Istrian extra virgin, award-winning", category: "croatian", priceCents: 1890, available: true, ageRestricted: false, emoji: "🫒" },
  { id: "ae-truffle", merchantId: "aelia", name: "Truffle spread 80 g", description: "Istrian black truffle", category: "croatian", priceCents: 1250, available: true, ageRestricted: false, emoji: "🍄" },
  { id: "ae-bajadera", merchantId: "aelia", name: "Bajadera pralines 300 g", description: "Kraš — the classic Croatian gift", category: "croatian", priceCents: 790, available: true, ageRestricted: false, allergens: ["nuts", "dairy"], emoji: "🍫" },
  { id: "ae-sunscreen", merchantId: "aelia", name: "Sun lotion SPF 50", description: "200 ml, travel size available", category: "beauty", priceCents: 1450, available: true, ageRestricted: false, emoji: "🧴" },
  { id: "ae-fragrance", merchantId: "aelia", name: "Eau de parfum 50 ml", description: "Selected designer fragrance", category: "beauty", priceCents: 6200, available: true, ageRestricted: false, emoji: "🌸" },
  { id: "ae-rakija", merchantId: "aelia", name: "Croatian rakija 0.7 L", description: "Travarica herbal brandy", category: "alcohol", priceCents: 2400, available: true, ageRestricted: true, emoji: "🍾" },

  // Apron View Restaurant
  { id: "ap-club", merchantId: "apron", name: "Club sandwich", description: "Chicken, bacon, egg, fries", category: "food", priceCents: 1150, available: true, ageRestricted: false, allergens: ["gluten", "egg"], emoji: "🥪" },
  { id: "ap-soup", merchantId: "apron", name: "Soup of the day", description: "Ask the kitchen — served with bread", category: "food", priceCents: 590, available: true, ageRestricted: false, allergens: ["gluten"], emoji: "🍲" },
  { id: "ap-juice", merchantId: "apron", name: "Fresh orange juice", description: "0.3 L", category: "cold-drinks", priceCents: 450, available: true, ageRestricted: false, emoji: "🍊" },

  // The Pub
  { id: "pb-soft", merchantId: "pub", name: "Soft drink 0.33 L", description: "Cola, tonic or lemonade", category: "cold-drinks", priceCents: 320, available: true, ageRestricted: false, emoji: "🥤" },
  { id: "pb-crisps", merchantId: "pub", name: "Crisps", description: "Salted or paprika", category: "snacks", priceCents: 280, available: true, ageRestricted: false, emoji: "🍟" },
  { id: "pb-beer", merchantId: "pub", name: "Draught beer 0.5 L", description: "Ožujsko on tap", category: "alcohol", priceCents: 550, available: true, ageRestricted: true, emoji: "🍺" },

  // Landside
  { id: "cn-latte", merchantId: "cafenero", name: "Caffè latte", description: "Regular", category: "hot-drinks", priceCents: 290, available: true, ageRestricted: false, emoji: "☕" },
  { id: "ti-sim", merchantId: "tisak", name: "Croatian SIM card", description: "Prepaid data, 10 GB", category: "snacks", priceCents: 1000, available: true, ageRestricted: false, emoji: "📱" },
  { id: "cb-burek", merchantId: "cakes", name: "Burek", description: "Cheese or meat", category: "food", priceCents: 350, available: true, ageRestricted: false, allergens: ["gluten", "dairy"], emoji: "🥟" },
];
