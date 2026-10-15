import Link from "next/link";
import { Settings } from "lucide-react";
import { getActiveEvent, getBatches, getBusyBusIds, getBuses, getCollectionPoints, getDeliveries, getEventCounts, getSites, sumBy } from "@/lib/data";
import { n0 } from "@/lib/format";
import { siteNeed } from "@/lib/match";
import { EmptyState, PageHeader } from "../ui";
import { TripPlanner } from "./trip-planner";

export default async function MatchPage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event?new=1">Create an event</Link>}>Create the event first.</EmptyState>;
  }
  const [batches, sites, deliveries, { pending }, hubs, buses, busyBusIds] = await Promise.all([
    getBatches(event.id, "approved"), getSites(), getDeliveries(event.id), getEventCounts(event.id),
    getCollectionPoints(event.id), getBuses(), getBusyBusIds(),
  ]);
  const sentByBatch = Object.fromEntries(sumBy(deliveries, (d) => d.batch_id, (d) => d.qty));
  const sentBySite = Object.fromEntries(sumBy(deliveries, (d) => d.site_id, (d) => d.qty));
  const people = sites.reduce((t, s) => t + siteNeed(s), 0);
  const noBuses = buses.filter((b) => b.active).length === 0;

  return (
    <>
      <PageHeader
        title="Which bus takes what, and where?"
        description="Each bus loads at one collection point and visits several places. Matching weighs need, distance, urgency and capacity; urgent food goes first, then trips are packed to the bus size."
      />
      <TripPlanner
        batches={batches} sites={sites} hubs={hubs.map((h) => ({ id: h.id, name: h.name }))} buses={buses} busyBusIds={busyBusIds}
        sentByBatch={sentByBatch} sentBySite={sentBySite} pendingCount={pending}
      >
        <div className="flex flex-col gap-2 border-y border-line py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            <p className="text-[15px]"><span className="font-mono font-semibold">{sites.length}</span> {sites.length === 1 ? "place" : "places"} · <span className="font-mono font-semibold">{n0(people)}</span> people to feed</p>
            <Link href="/setup" className="inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"><Settings className="size-4" aria-hidden />Manage places</Link>
          </div>
          {sites.length === 0 && <p className="text-sm font-medium text-warn">No places yet. <Link href="/setup" className="underline underline-offset-4">Add the places you deliver to in Setup</Link>.</p>}
          {noBuses && <p className="text-sm font-medium text-warn">No active buses. <Link href="/setup" className="underline underline-offset-4">Add buses in Setup</Link>; trips are planned for 400 packs meanwhile.</p>}
        </div>
      </TripPlanner>
    </>
  );
}
