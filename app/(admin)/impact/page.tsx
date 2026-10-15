import Link from "next/link";
import { getActiveEvent, getBatches, getDeliveries, getPhotoUrls, getSites, sumBy } from "@/lib/data";
import { predict } from "@/lib/predict";
import { fmtDur, fmtTime, minutesBetween, n0 } from "@/lib/format";
import { siteNeed } from "@/lib/match";
import { EmptyState, PageHeader, SectionHead, Stat } from "../ui";
import { PrintButton } from "./print-button";
import { PhotoThumb } from "../photo-viewer";

export const dynamic = "force-dynamic";
const TECH_BUDGET = 50_000; // ₦, platform only

export default async function ImpactPage() {
  const event = await getActiveEvent();
  if (!event) return <EmptyState action={<Link href="/event">Set up the event</Link>}>Create the event first.</EmptyState>;
  const [batches, deliveries, sites] = await Promise.all([getBatches(event.id, "approved"), getDeliveries(event.id), getSites()]);

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
  const gallery = batches.filter((b) => b.photo_path).sort((a, b) => +new Date(b.collected_at) - +new Date(a.collected_at)).slice(0, 24);
  const photoUrls = await getPhotoUrls(gallery);
  const safePct = deliveredQty ? Math.round((100 * safeQty) / deliveredQty) : 0;

  const summary = deliveredQty
    ? `${event.name}: ${n0(deliveredQty)} portions reached ${siteRows.length} ${siteRows.length === 1 ? "site" : "sites"}, ${safePct}% inside the safe window, about ${fmtDur(avgMin)} from collection to delivery.`
    : `${event.name}: no deliveries completed yet. This report fills in as volunteers mark deliveries as delivered.`;

  return (
    <>
      <PageHeader eyebrow="After the event" title={`Impact report · ${event.name}`} description={summary} actions={<PrintButton />} />

      <div className="grid grid-cols-2 gap-x-5 gap-y-7 md:grid-cols-4">
        <Stat label="Portions delivered" value={n0(deliveredQty)} hint={`of ${n0(recovered)} recovered · baseline 350 at Matriculation`} />
        <Stat label="Delivered in safe window" value={deliveredQty ? `${safePct}%` : "—"} hint={`${n0(safeQty)} portions on time`} tone={deliveredQty ? (safePct >= 90 ? "green" : safePct >= 70 ? "orange" : "red") : undefined} />
        <Stat label="Collection → delivery" value={deliveredQty ? fmtDur(avgMin) : "—"} hint="average, weighted by portions" />
        <Stat label="Tech cost per meal" value={deliveredQty ? `₦${n0(TECH_BUDGET / deliveredQty)}` : "—"} hint="₦50,000 platform budget. Excludes packaging and transport." />
      </div>

      <div className="grid gap-x-12 gap-y-9 md:grid-cols-2">
        <section className="flex flex-col gap-4">
          <SectionHead title="Where the food went" aside="portions delivered vs need" />
          {siteRows.length === 0 ? <p className="text-sm text-muted">No deliveries completed yet.</p> : (
            <ul className="flex flex-col gap-5">
              {siteRows.map((s) => {
                const got = bySite.get(s.id) ?? 0;
                const need = siteNeed(s);
                const pct = need > 0 ? Math.round((100 * got) / need) : 0;
                return (
                  <li key={s.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-medium">{s.name}</span>
                      <span className="font-mono text-sm"><b className="font-semibold">{n0(got)}</b> <span className="text-muted">of {n0(need)} · {pct}%</span></span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${s.name}: ${got} of ${need} portions needed, ${pct}%`}>
                      <i className={`block h-full rounded-full ${pct >= 100 ? "bg-ok" : "bg-sky"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-4">
          <SectionHead title="Prediction check" />
          <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3 text-[15px]">
            <dt className="text-muted">Predicted surplus</dt><dd className="font-medium"><span className="font-mono">{n0(predicted)}</span> meals</dd>
            <dt className="text-muted">Actually recovered</dt><dd className="font-medium"><span className="font-mono">{n0(recovered)}</span> portions in {batches.length} batches</dd>
            <dt className="text-muted">Delays reported</dt><dd className="font-mono font-medium">{delays}</dd>
            <dt className="text-muted">Next step</dt><dd className="font-medium">Use the real surplus figure to recalibrate the {Math.round(predict(event).rate * 100)}% rate in lib/predict.ts.</dd>
          </dl>
        </section>
      </div>
      {gallery.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHead title="Photos from tonight" aside={`${gallery.length} shown`} />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 md:grid-cols-4">
            {gallery.filter((b) => photoUrls[b.id]).map((b) => (
              <li key={b.id} className="flex flex-col gap-1.5">
                <PhotoThumb src={photoUrls[b.id]} label={`${b.food}, ${b.qty} portions, ${fmtTime(b.collected_at)}`} size={200} />
                <p className="text-sm leading-snug font-medium">{b.food}</p>
                <p className="font-mono text-xs text-muted">{b.qty} portions · {fmtTime(b.collected_at)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
