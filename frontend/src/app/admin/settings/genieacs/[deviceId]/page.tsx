import { redirect } from 'next/navigation';

export default async function OldGenieacsDeviceDetailPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;
  redirect(`/admin/genieacs/devices/${deviceId}`);
}
