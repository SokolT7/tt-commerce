/**
 * Environment access, validated once at startup.
 *
 * Optional integrations (payments, fiscalisation, the robot vendor) are absent
 * until their keys are filled in. The app runs fully without them, using the
 * mock provider or the simulator — so a missing key degrades one capability
 * rather than breaking the build.
 */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v;
}

const optional = (name: string): string | null => process.env[name] || null;

export const env = {
  supabaseUrl: required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};

/** Server-only. Never import this from a client component. */
export const serverEnv = {
  serviceRoleKey: () => required("SUPABASE_SERVICE_ROLE_KEY"),
  stripeSecret: () => optional("STRIPE_SECRET_KEY"),
  fiscalUrl: () => optional("FISCAL_PROVIDER_URL"),
  fiscalKey: () => optional("FISCAL_PROVIDER_API_KEY"),
  fleetAdapter: () => process.env.FLEET_ADAPTER || "simulated",
  robotApiBase: () => optional("ROBOT_API_BASE_URL"),
  robotApiKey: () => optional("ROBOT_API_KEY"),
  fidsUrl: () => optional("FIDS_API_URL"),
};

export const capabilities = {
  realPayments: () => Boolean(process.env.STRIPE_SECRET_KEY),
  realFiscalisation: () => Boolean(process.env.FISCAL_PROVIDER_API_KEY),
  realFleet: () => process.env.FLEET_ADAPTER === "vendor" && Boolean(process.env.ROBOT_API_BASE_URL),
  realFids: () => Boolean(process.env.FIDS_API_URL),
};
