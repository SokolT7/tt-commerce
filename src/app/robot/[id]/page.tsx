import { RobotScreen } from "@/components/RobotScreen";

export default async function RobotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RobotScreen unitId={id} />;
}
