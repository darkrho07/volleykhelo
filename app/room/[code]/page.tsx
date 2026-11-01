import VolleyAppShell from '../../../components/ui/VolleyAppShell';

export default async function RoomByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <VolleyAppShell initialRoomCode={code} />;
}
