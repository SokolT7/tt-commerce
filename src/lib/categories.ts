/**
 * Shop categories are defined per merchant, so the same thing appears as
 * "Coffee" at one outlet and "Hot drinks" at another. For a browse that spans
 * the terminal, they are folded into a small set of themes a passenger would
 * actually recognise — each with its own hue.
 *
 * Colours are muted and slightly desaturated on purpose: enough variety to
 * make the app feel alive, not so much that it reads as a children's menu.
 */

export interface Theme {
  id: string;
  label: string;
  /** Shown on the category tile. */
  blurb: string;
  hue: string;
  icon: string;
}

export const THEMES: Theme[] = [
  { id: "coffee",  label: "Coffee & tea", blurb: "Before the gate",   hue: "#A9603C", icon: "coffee" },
  { id: "food",    label: "Something to eat", blurb: "Hot and fresh", hue: "#4F6B3A", icon: "food" },
  { id: "cold",    label: "Cold drinks",  blurb: "Water, juice, soft", hue: "#3D6A88", icon: "cold" },
  { id: "snacks",  label: "Snacks",       blurb: "For the flight",    hue: "#B07A16", icon: "snack" },
  { id: "gifts",   label: "Croatian gifts", blurb: "Take home",       hue: "#6E4A72", icon: "gift" },
  { id: "beauty",  label: "Beauty",       blurb: "Travel sizes",      hue: "#A8506B", icon: "beauty" },
  { id: "spirits", label: "Spirits",      blurb: "Collect in store",  hue: "#7C3B47", icon: "spirit" },
];

const BY_CATEGORY_NAME: Record<string, string> = {
  "coffee": "coffee",
  "hot drinks": "coffee",
  "bakery": "food",
  "food": "food",
  "mains": "food",
  "cold drinks": "cold",
  "drinks": "cold",
  "snacks": "snacks",
  "croatian specialities": "gifts",
  "beauty": "beauty",
  "spirits": "spirits",
};

/** Keywords used when a product has no category at all. */
const BY_KEYWORD: [RegExp, string][] = [
  [/coffee|espresso|cappuccino|latte|cortado|flat white|tea/i, "coffee"],
  [/water|juice|cola|lemonade|tonic|soft drink|smoothie/i, "cold"],
  [/beer|wine|rakija|gin|whisky|vodka|spirit/i, "spirits"],
  [/crisp|nuts|chocolate|praline|bar$|snack/i, "snacks"],
  [/oil|truffle|honey|souvenir|gift/i, "gifts"],
  [/cream|lotion|perfume|parfum|spf|serum/i, "beauty"],
  [/sandwich|toastie|salad|soup|burek|croissant|pastry|club|meal/i, "food"],
];

export function themeFor(categoryName: string | null, productName: string): Theme {
  if (categoryName) {
    const hit = BY_CATEGORY_NAME[categoryName.trim().toLowerCase()];
    if (hit) return THEMES.find((t) => t.id === hit)!;
  }
  for (const [re, id] of BY_KEYWORD) {
    if (re.test(productName)) return THEMES.find((t) => t.id === id)!;
  }
  return THEMES.find((t) => t.id === "snacks")!;
}

/** Tint a hue for use as a surface behind text of that same hue. */
export function tint(hue: string, amount = 12): string {
  return `color-mix(in srgb, ${hue} ${amount}%, white)`;
}
