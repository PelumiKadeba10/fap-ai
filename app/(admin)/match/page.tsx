import Link from "next/link";
import { getActiveEvent, getBatches, getDeliveries, getSites, sumBy } from "@/lib/data";
import { SitesEditor } from "./sites-editor";
import { PlanPanel } from "./plan-panel";

export default async function MatchPage() {
  const event = await getActiveEvent();
  if (!event) {
    return <div className="empty">Create the event first on <Link className="underline" href="/event">Event & surplus</Link>.</div>;
  }
  const [batches, sites, deliveries] = await Promise.all([getBatches(event.id), getSites(), getDeliveries(event.id)]);
  const sentByBatch = Object.fromEntries(sumBy(deliveries, (d) => d.batch_id, (d) => d.qty));
  const sentBySite = Object.fromEntries(sumBy(deliveries, (d) => d.site_id, (d) => d.qty));

  return (
    <>
      <div>
        <p className="eyebrow">Steps 4–6 · Sites, match, route</p>
        <h1 className="h1">Where should each portion go?</h1>
        <p className="lede">Need is forecast from past distributions. Matching weighs need, distance, urgency and capacity, so perishable food goes to the nearest sites first.</p>
      </div>
      <SitesEditor sites={sites} />
      <PlanPanel batches={batches} sites={sites} sentByBatch={sentByBatch} sentBySite={sentBySite} />
    </>
  );
}
