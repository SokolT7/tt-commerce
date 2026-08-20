import { MerchantConsole } from "@/components/MerchantConsole";

export default async function MerchantPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MerchantConsole merchantId={id} />;
}
