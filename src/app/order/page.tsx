import { redirect } from "next/navigation";

/** Kept so existing links and printed QR codes do not break. */
export default function OrderPage() {
  redirect("/");
}
