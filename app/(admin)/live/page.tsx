import Link from "next/link";
import { getActiveEvent, getBatches, getBusLinks, getBuses, getCollectionPoints, getDeliveries, getEventSites, getSites, getTrips } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "../ui";
import { SetupSummary } from "../setup-summary";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const event = await getActiveEvent();
  if (!event) return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;

  const supabase = await createClient();
  const [deliveries, batches, sites, eventSites, trips, buses, busLinks, hubs, updates] = await Promise.all([
    getDeliveries(event.id),
    getBatches(event.id),
    getSites(),
    getEventSites(event.id),
    getTrips(event.id),
    getBuses(event.id),
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
        title="Every bus at a glance."
        description="Each bus lead taps updates on their bus link. Send it once, watch progress, and step in when a stop is late or a bus is stuck."
      />
      <SetupSummary places={eventSites.length} people={eventSites.reduce((t, s) => t + s.people, 0)} buses={buses.filter((b) => b.active).length} />
      {deliveries.length === 0 && trips.length === 0 ? (
        <EmptyState action={<Link href="/match">Go to Plan trips</Link>}>No trips yet. Plan and approve trips to start dispatching.</EmptyState>
      ) : (
        <LiveBoard
          eventId={event.id}
          trips={trips}
          buses={buses}
          busLinks={busLinks.map((l) => ({ bus_id: l.bus_id, token: l.token }))}
          hubs={hubs.map((h) => ({ id: h.id, name: h.name, volunteers: h.volunteers, lead_name: h.lead_name }))}
          deliveries={deliveries}
          batches={batches}
          sites={sites}
          updates={(updates.data ?? []).map(({ id, delivery_id, status, note, created_at }) => ({ id, delivery_id, status, note, created_at }))}
          siteUrl={process.env.SITE_URL ?? ""}
        />
      )}
    </>
  );
}
