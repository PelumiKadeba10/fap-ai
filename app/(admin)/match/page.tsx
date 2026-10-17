import Link from "next/link";
import { getActiveEvent, getBatches, getBuses, getCollectionPoints, getDeliveries, getEventCounts, getEventSites, getTrips, sumBy } from "@/lib/data";
import { busesOut } from "@/lib/bus-state";
import { SetupSummary } from "../setup-summary";
import { EmptyState, PageHeader } from "../ui";
import { TripPlanner } from "./trip-planner";

export default async function MatchPage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event?new=1">Create an event</Link>}>Create the event first.</EmptyState>;
  }
  const [batches, sites, deliveries, { pendingBatches }, hubs, buses, trips] = await Promise.all([
    getBatches(event.id, "approved"), getEventSites(event.id), getDeliveries(event.id), getEventCounts(event.id),
    getCollectionPoints(event.id), getBuses(event.id), getTrips(event.id),
  ]);
  const sentByBatch = Object.fromEntries(sumBy(deliveries, (d) => d.batch_id, (d) => d.qty));
  const sentBySite = Object.fromEntries(sumBy(deliveries, (d) => d.site_id, (d) => d.qty));
  const out = busesOut(buses, trips, deliveries);
  const people = sites.reduce((t, s) => t + s.people, 0);

  return (
    <>
      <PageHeader
        title="Which bus takes what, and where?"
        description="Each bus loads at one collection point and visits several places. Matching weighs need, distance, urgency and capacity; urgent food goes first, then trips are packed to the bus size."
      />
      <TripPlanner
        batches={batches} sites={sites} hubs={hubs.map((h) => ({ id: h.id, name: h.name, volunteers: h.volunteers }))} buses={buses} busesOut={out}
        tripNumbers={trips.map((t) => ({ bus_id: t.bus_id, trip_no: t.trip_no }))} packsPerCarton={event.packs_per_carton}
        sentByBatch={sentByBatch} sentBySite={sentBySite} pendingCount={pendingBatches}
      >
        <SetupSummary places={sites.length} people={people} buses={buses.filter((x) => x.active).length} />
      </TripPlanner>
    </>
  );
}
