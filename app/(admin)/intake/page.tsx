import Link from "next/link";
import { getActiveEvent, getBatches, getDeliveries, sumBy } from "@/lib/data";
import { EmptyState, PageHeader } from "../ui";
import { IntakeBox } from "./intake-box";
import { BatchTable } from "./batch-table";

export default async function IntakePage() {
  const event = await getActiveEvent();
  if (!event) {
    return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;
  }
  const [batches, deliveries] = await Promise.all([getBatches(event.id), getDeliveries(event.id)]);
  const sent = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);

  return (
    <>
      <PageHeader
        eyebrow="Steps 2 & 3 · During the event"
        title="Volunteers text it. FAP AI files it."
        description="Paste or type a volunteer’s message. FAP AI turns it into a record you can check before saving, and scores its urgency."
      />
      <IntakeBox />
      <BatchTable batches={batches} sent={Object.fromEntries(sent)} />
    </>
  );
}
