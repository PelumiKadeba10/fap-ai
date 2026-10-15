import Link from "next/link";
import { getActiveEvent, getBatches, getDeliveries, getFoodWaiting, getSites, sumBy } from "@/lib/data";
import { EmptyState, PageHeader } from "../ui";
import { SitesEditor } from "./sites-editor";
import { PlanPanel } from "./plan-panel";

export default async function MatchPage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;
  }
  const [batches, sites, deliveries, { pending }] = await Promise.all([getBatches(event.id, "approved"), getSites(), getDeliveries(event.id), getFoodWaiting(event.id)]);
  const sentByBatch = Object.fromEntries(sumBy(deliveries, (d) => d.batch_id, (d) => d.qty));
  const sentBySite = Object.fromEntries(sumBy(deliveries, (d) => d.site_id, (d) => d.qty));

  return (
    <>
      <PageHeader
        eyebrow="Steps 4–6 · Sites, match, route"
        title="Where should each portion go?"
        description="Need is forecast from past distributions. Matching weighs need, distance, urgency and capacity, so perishable food goes to the nearest sites first."
      />
      <PlanPanel batches={batches} sites={sites} sentByBatch={sentByBatch} sentBySite={sentBySite} pendingCount={pending}>
        <SitesEditor sites={sites} />
      </PlanPanel>
    </>
  );
}
