import { RobotScreen } from "@/components/RobotScreen";

export const dynamic = "force-dynamic";

/**
 * The unit's own screen, run in kiosk mode on the tablet mounted to it.
 * Deliberately not linked from anywhere — it is opened once per device.
 */
export default async function RobotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RobotScreen unitId={id} />;
}
