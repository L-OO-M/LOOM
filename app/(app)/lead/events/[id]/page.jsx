import { EventOpsPage } from "@/components/events/EventOpsPage";

export const dynamic = "force-dynamic";

export default async function LeadEventDetailPage({ params }) {
  const { id } = await params;
  return <EventOpsPage id={id} area="lead" />;
}
