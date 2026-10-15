import Link from "next/link";
import { getActiveEvent, getBatches, getDeliveries, getSites, sumBy } from "@/lib/data";
import { predict } from "@/lib/predict";
import { fmtDur, minutesBetween, n0 } from "@/lib/format";
import { siteNeed } from "@/lib/match";
import { cardTable } from "../ui";

export const dynamic = "force-dynamic";
const TECH_BUDGET = 50_000; // ₦, platform only

export default async function ImpactPage() {
  const event = await getActiveEvent();
  if (!event) return <div className="empty">Create the event first on <Link className="underline" href="/event">Event & surplus</Link>.</div>;
  const [batches, deliveries, sites] = await Promise.all([getBatches(event.id), getDeliveries(event.id), getSites()]);

  const recovered = batches.reduce((t, b) => t + b.qty, 0);
  const done = deliveries.filter((d) => d.status === "delivered" && d.delivered_at);
  const deliveredQty = done.reduce((t, d) => t + d.qty, 0);
  const safeQty = done.filter((d) => new Date(d.delivered_at!) <= new Date(d.safe_until)).reduce((t, d) => t + d.qty, 0);
  const batchById = new Map(batches.map((b) => [b.id, b]));
  const avgMin = deliveredQty
    ? done.reduce((t, d) => t + minutesBetween(batchById.get(d.batch_id)!.collected_at, d.delivered_at!) * d.qty, 0) / deliveredQty
    : 0;
  const delays = deliveries.filter((d) => d.was_delayed).length;
  const bySite = sumBy(done, (d) => d.site_id, (d) => d.qty);
  const siteRows = sites.filter((s) => bySite.has(s.id));
  const predicted = predict(event).surplus;

  return (
    <>
      <div>
        <p className="eyebrow">After the event</p>
        <h1 className="h1">Impact report · {event.name}</h1>
        <p className="lede">Built from the platform’s own records. Volunteers enter nothing extra.</p>
      </div>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        <Stat k="Portions delivered" v={n0(deliveredQty)} s={`of ${n0(recovered)} recovered · baseline 350 at Matriculation`} />
        <Stat k="Delivered in safe window" v={deliveredQty ? `${Math.round((100 * safeQty) / deliveredQty)}%` : "—"} s={`${n0(safeQty)} portions on time`} />
        <Stat k="Collection → delivery" v={deliveredQty ? fmtDur(avgMin) : "—"} s="average, weighted by portions" />
        <Stat k="Tech cost per meal" v={deliveredQty ? `₦${n0(TECH_BUDGET / deliveredQty)}` : "—"} s="₦50,000 platform budget. Excludes packaging and transport." />
      </div>
      <div className="grid gap-7 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Where the food went</h2>
          {siteRows.length === 0 ? <p className="text-sm text-muted">No deliveries completed yet.</p> : (
            <table className={cardTable}>
              <thead><tr><th className="th">Beneficiary</th><th className="th text-right">Portions</th><th className="th text-right">Need</th></tr></thead>
              <tbody>
                {siteRows.map((s) => (
                  <tr key={s.id}>
                    <td className="cell" data-label="Beneficiary">{s.name}</td>
                    <td className="cell font-mono md:text-right" data-label="Portions">{bySite.get(s.id)}</td>
                    <td className="cell font-mono md:text-right" data-label="Need">{siteNeed(s)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Prediction check</h2>
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">
            <dt className="text-muted">Predicted surplus</dt><dd className="font-medium">{n0(predicted)} meals</dd>
            <dt className="text-muted">Actually recovered</dt><dd className="font-medium">{n0(recovered)} portions in {batches.length} batches</dd>
            <dt className="text-muted">Delays reported</dt><dd className="font-medium">{delays}</dd>
            <dt className="text-muted">Next step</dt><dd className="font-medium">Use the real surplus figure to recalibrate the {Math.round(predict(event).rate * 100)}% rate in lib/predict.ts.</dd>
          </dl>
        </section>
      </div>
    </>
  );
}

function Stat({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="border-t border-line pt-3.5">
      <p className="stat-k">{k}</p>
      <p className="stat-v">{v}</p>
      <p className="stat-s">{s}</p>
    </div>
  );
}
