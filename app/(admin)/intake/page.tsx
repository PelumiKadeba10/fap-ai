import Link from "next/link";
import { ChevronRight, MapPinned } from "lucide-react";
import { getActiveEvent, getBatches, getCollectionPoints, getDeliveries, getPhotoUrls, sumBy } from "@/lib/data";
import { EmptyState, PageHeader } from "../ui";
import { IntakeBox } from "./intake-box";
import { BatchTable } from "./batch-table";
import { NeedsChecking } from "./needs-checking";
import { CollectionPoints } from "./collection-points";

export default async function IntakePage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event?new=1">Create an event</Link>}>Create the event first.</EmptyState>;
  }
  const [approved, pending, points, deliveries] = await Promise.all([
    getBatches(event.id, "approved"),
    getBatches(event.id, "pending"),
    getCollectionPoints(event.id),
    getDeliveries(event.id),
  ]);
  const photos = await getPhotoUrls([...approved, ...pending]);
  const sent = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);

  return (
    <>
      <PageHeader
        title="Check what the collection points send."
        description="Each collection point reports food from its own link. Check every submission before it is matched. FAP AI reads the message and scores its urgency."
      />

      {points.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-l-4 border-orange bg-[#fffaf0] px-4 py-3.5" role="status">
          <p className="flex items-start gap-2 text-[15px] font-medium"><MapPinned className="mt-0.5 size-4 shrink-0" aria-hidden />No collection points yet for this event. Add each collection point to give it a link for reporting food.</p>
          <a href="#collection-points" className="text-sm font-semibold underline underline-offset-4">Add collection points</a>
        </div>
      )}

      <NeedsChecking eventId={event.id} batches={pending} pointNames={Object.fromEntries(points.map((p) => [p.id, p.name]))} photos={photos} />
      <BatchTable batches={approved} sent={Object.fromEntries(sent)} photos={photos} />

      <details className="group border-t border-line pt-5">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-base font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
          Add food yourself
        </summary>
        <p className="mt-2 mb-6 text-sm text-muted">Use this if a collection point can’t use its link, e.g. no data or a phone call.</p>
        <IntakeBox hubs={points.filter((p) => p.active)} />
      </details>

      <CollectionPoints points={points} siteUrl={process.env.SITE_URL ?? ""} />
    </>
  );
}
