import Link from "next/link";
import { getActiveEvent, getBatches, getBusyBusIds, getBuses, getCollectionPoints, getDeliveries, getFoodWaiting, getSites, sumBy } from "@/lib/data";
import { EmptyState, PageHeader } from "../ui";
import { SitesEditor } from "./sites-editor";
import { TripPlanner } from "./trip-planner";

export default async function MatchPage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;
  }
  const [batches, sites, deliveries, { pending }, hubs, buses, busyBusIds] = await Promise.all([
    getBatches(event.id, "approved"), getSites(), getDeliveries(event.id), getFoodWaiting(event.id),
    getCollectionPoints(event.id), getBuses(), getBusyBusIds(),
  ]);
  const sentByBatch = Object.fromEntries(sumBy(deliveries, (d) => d.batch_id, (d) => d.qty));
  const sentBySite = Object.fromEntries(sumBy(deliveries, (d) => d.site_id, (d) => d.qty));

  return (
    <>
      <PageHeader
        eyebrow="Steps 4–6 · Sites, trips, route"
        title="Which bus takes what, and where?"
        description="Each bus loads at one hub and visits several sites. Matching weighs need, distance, urgency and capacity; urgent food goes first, then trips are packed to the bus size."
      />
      <TripPlanner
        batches={batches} sites={sites} hubs={hubs.map((h) => ({ id: h.id, name: h.name }))} buses={buses} busyBusIds={busyBusIds}
        sentByBatch={sentByBatch} sentBySite={sentBySite} pendingCount={pending}
      >
        <SitesEditor sites={sites} />
      </TripPlanner>
    </>
  );
}
