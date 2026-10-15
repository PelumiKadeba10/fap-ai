import Link from "next/link";
import { getActiveEvent, getBatches, getBusyBusIds, getBuses, getCollectionPoints, getDeliveries, getEventCounts, getEventSites, sumBy } from "@/lib/data";
import { SetupSummary } from "../setup-summary";
import { EmptyState, PageHeader } from "../ui";
import { TripPlanner } from "./trip-planner";

export default async function MatchPage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event?new=1">Create an event</Link>}>Create the event first.</EmptyState>;
  }
  const [batches, sites, deliveries, { pendingBatches }, hubs, buses, busyBusIds] = await Promise.all([
    getBatches(event.id, "approved"), getEventSites(event.id), getDeliveries(event.id), getEventCounts(event.id),
    getCollectionPoints(event.id), getBuses(event.id), getBusyBusIds(),
  ]);
  const sentByBatch = Object.fromEntries(sumBy(deliveries, (d) => d.batch_id, (d) => d.qty));
  const sentBySite = Object.fromEntries(sumBy(deliveries, (d) => d.site_id, (d) => d.qty));
  const people = sites.reduce((t, s) => t + s.people, 0);

  return (
    <>
      <PageHeader
        title="Which bus takes what, and where?"
        description="Each bus loads at one collection point and visits several places. Matching weighs need, distance, urgency and capacity; urgent food goes first, then trips are packed to the bus size."
      />
      <TripPlanner
        batches={batches} sites={sites} hubs={hubs.map((h) => ({ id: h.id, name: h.name }))} buses={buses} busyBusIds={busyBusIds}
        sentByBatch={sentByBatch} sentBySite={sentBySite} pendingCount={pendingBatches}
      >
        <SetupSummary places={sites.length} people={people} buses={buses.filter((x) => x.active).length} />
      </TripPlanner>
    </>
  );
}
