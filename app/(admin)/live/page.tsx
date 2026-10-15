import Link from "next/link";
import { getActiveEvent, getBatches, getBusLinks, getBuses, getCollectionPoints, getDeliveries, getSites, getTrips, getVolunteers } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "../ui";
import { BusesManager } from "./buses-manager";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const event = await getActiveEvent();
  if (!event) return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;

  const supabase = await createClient();
  const [deliveries, batches, sites, volunteers, trips, buses, busLinks, hubs, updates] = await Promise.all([
    getDeliveries(event.id),
    getBatches(event.id),
    getSites(),
    getVolunteers(),
    getTrips(event.id),
    getBuses(),
    getBusLinks(event.id),
    getCollectionPoints(event.id),
    supabase
      .from("status_updates")
      .select("id, delivery_id, status, note, created_at, deliveries!inner(event_id)")
      .eq("deliveries.event_id", event.id)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Step 7 · Live dispatch"
        title="Every bus at a glance."
        description="Each bus lead taps updates on their trip link. Send the link, watch progress, and step in when a stop is late or a bus is stuck."
      />
      {deliveries.length === 0 && trips.length === 0 ? (
        <>
          <EmptyState action={<Link href="/match">Go to Match & route</Link>}>No trips yet. Plan and approve trips to start dispatching.</EmptyState>
          <BusesManager buses={buses} busyIds={[]} />
        </>
      ) : (
        <LiveBoard
          eventId={event.id}
          trips={trips}
          buses={buses}
          busLinks={busLinks.map((l) => ({ bus_id: l.bus_id, token: l.token }))}
          hubs={hubs.map((h) => ({ id: h.id, name: h.name }))}
          deliveries={deliveries}
          batches={batches}
          sites={sites}
          volunteers={volunteers}
          updates={(updates.data ?? []).map(({ id, delivery_id, status, note, created_at }) => ({ id, delivery_id, status, note, created_at }))}
          siteUrl={process.env.SITE_URL ?? ""}
        />
      )}
    </>
  );
}
