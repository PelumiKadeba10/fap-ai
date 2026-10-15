import Link from "next/link";
import { Truck } from "lucide-react";
import { getActiveEvent, getBatches, getDeliveries, getSites, getVolunteers } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, PageHeader } from "../ui";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const event = await getActiveEvent();
  if (!event) return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;

  const supabase = await createClient();
  const [deliveries, batches, sites, volunteers, updates] = await Promise.all([
    getDeliveries(event.id),
    getBatches(event.id),
    getSites(),
    getVolunteers(),
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
        title="Every delivery at a glance."
        description="Volunteers send a status from their phones. Assign each delivery, send the volunteer their link, and watch for anything close to its safe time."
      />
      {deliveries.length === 0 ? (
        <EmptyState icon={Truck} action={<Link href="/match">Go to Match & route</Link>}>No deliveries yet. Approve a plan to create them.</EmptyState>
      ) : (
        <LiveBoard
          eventId={event.id}
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
