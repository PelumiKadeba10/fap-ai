import Link from "next/link";
import { getActiveEvent, getBatches, getCollectionPoints, getDeliveries, sumBy } from "@/lib/data";
import { EmptyState, PageHeader } from "../ui";
import { IntakeBox } from "./intake-box";
import { BatchTable } from "./batch-table";
import { NeedsChecking } from "./needs-checking";
import { CollectionPoints } from "./collection-points";

export default async function IntakePage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;
  }
  const [approved, pending, points, deliveries] = await Promise.all([
    getBatches(event.id, "approved"),
    getBatches(event.id, "pending"),
    getCollectionPoints(event.id),
    getDeliveries(event.id),
  ]);
  const sent = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);

  return (
    <>
      <PageHeader
        eyebrow="Steps 2 & 3 · During the event"
        title="Volunteers text it. FAP AI files it."
        description="Check food reported from collection points, or paste a volunteer’s message. FAP AI turns it into a record you can check before it is matched, and scores its urgency."
      />
      <NeedsChecking eventId={event.id} batches={pending} pointNames={Object.fromEntries(points.map((p) => [p.id, p.name]))} />
      <IntakeBox />
      <BatchTable batches={approved} sent={Object.fromEntries(sent)} />
      <CollectionPoints points={points} siteUrl={process.env.SITE_URL ?? ""} />
    </>
  );
}
