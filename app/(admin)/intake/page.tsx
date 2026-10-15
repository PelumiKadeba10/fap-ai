import Link from "next/link";
import { getActiveEvent, getBatches, getDeliveries, sumBy } from "@/lib/data";
import { IntakeBox } from "./intake-box";
import { BatchTable } from "./batch-table";

export default async function IntakePage() {
  const event = await getActiveEvent();
  if (!event) {
    return <div className="empty">Create the event first on <Link className="underline" href="/event">Event & surplus</Link>.</div>;
  }
  const [batches, deliveries] = await Promise.all([getBatches(event.id), getDeliveries(event.id)]);
  const sent = sumBy(deliveries, (d) => d.batch_id, (d) => d.qty);

  return (
    <>
      <div>
        <p className="eyebrow">Steps 2 & 3 · During the event</p>
        <h1 className="h1">Volunteers text it. FAP AI files it.</h1>
        <p className="lede">Paste or type a volunteer’s message. FAP AI turns it into a record you can check before saving, and scores its urgency.</p>
      </div>
      <IntakeBox />
      <BatchTable batches={batches} sent={Object.fromEntries(sent)} />
    </>
  );
}
