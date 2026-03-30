import { redirect } from "next/navigation";

interface PageProps {
  params: { monitorId: string };
}

export default function MonitorChangesRedirectPage({ params }: PageProps) {
  redirect(`/dashboard/monitor/${params.monitorId}/content`);
}
