import Link from "next/link";
import { getActiveEvent, getBatches, getDeliveries, getSites, getVolunteers } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { LiveBoard } from "./live-board";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const event = await getActiveEvent();
  if (!event) return <div className="empty">Create the event first on <Link className="underline" href="/event">Event & surplus</Link>.</div>;

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
      <div>
        <p className="eyebrow">Step 7 · Live dispatch</p>
        <h1 className="h1">Every delivery at a glance.</h1>
        <p className="lede">Volunteers send a status from their phones. Assign each delivery, send the volunteer their link, and watch for anything close to its safe time.</p>
      </div>
      {deliveries.length === 0 ? (
        <div className="empty">No deliveries yet. Approve a plan on <Link className="underline" href="/match">Match & route</Link>.</div>
      ) : (
        <LiveBoard
          eventId={event.id}
          deliveries={deliveries}
          batches={batches}
          sites={sites}
          volunteers={volunteers}
          updates={(updates.data ?? []).map(({ id, delivery_id, status, note, created_at }) => ({ id, delivery_id, status, note, created_at }))}
          siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? ""}
        />
      )}
    </>
  );
}
