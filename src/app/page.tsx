import { OrderApp } from "@/components/OrderApp";

export const dynamic = "force-dynamic";

/**
 * The root is the passenger app. Staff surfaces are deliberately not linked
 * from here — shop owners are given a direct link to their own console and
 * administrators go to /admin.
 */
export default function Home() {
  return <OrderApp />;
}
