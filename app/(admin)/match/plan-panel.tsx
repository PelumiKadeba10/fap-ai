"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Play, RotateCw, Route } from "lucide-react";
import type { Batch, Site } from "@/lib/types";
import { runMatching } from "@/lib/match";
import { urgency } from "@/lib/urgency";
import { fmtDur, fmtTime, n0 } from "@/lib/format";
import { approvePlan } from "../actions";
import { EmptyState, SectionHead, UrgencyPill, cardTable } from "../ui";
import { useToast } from "../toast";
import { SiteMap } from "./site-map";

export function PlanPanel({ batches, sites, sentByBatch, sentBySite }: {
  batches: Batch[]; sites: Site[]; sentByBatch: Record<string, number>; sentBySite: Record<string, number>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState<Date | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const plan = useMemo(() => {
    if (!now) return null;
    return runMatching(
      batches.map((b) => ({ id: b.id, category: b.category, collected_at: b.collected_at, available: b.qty - (sentByBatch[b.id] ?? 0) })),
      sites.map((s) => ({ ...s, km: Number(s.km), alreadyAllocated: sentBySite[s.id] ?? 0 })),
      now,
    );
  }, [now, batches, sites, sentByBatch, sentBySite]);

  const batchById = new Map(batches.map((b) => [b.id, b]));
  const siteById = new Map(sites.map((s) => [s.id, s]));
  const available = batches.reduce((t, b) => t + Math.max(0, b.qty - (sentByBatch[b.id] ?? 0)), 0);

  // Most urgent food first; ties broken by least spare time.
  const rows = useMemo(() => {
    if (!plan || !now) return [];
    return plan.allocations
      .map((a) => ({ a, b: batchById.get(a.batchId)!, u: urgency(batchById.get(a.batchId)!, now) }))
      .sort((x, y) => y.u.score - x.u.score || x.a.spareMin - y.a.spareMin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, now]);

  function approve() {
    start(async () => {
      const r = await approvePlan();
      setConfirming(false);
      if (!r.ok) return toast(false, r.error);
      toast(true, `${r.created} deliveries created. Assign volunteers on Live dispatch.`);
      setNow(null);
      router.refresh();
    });
  }

  const count = plan?.allocations.length ?? 0;

  return (
    <section className="flex flex-col gap-5">
      <SectionHead title="Recommended allocation" aside={<><span className="font-mono">{n0(available)}</span> portions not yet sent out</>} />
      <div className="grid gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <SiteMap sites={sites} allocations={plan?.allocations ?? []} urgentBatchIds={new Set(batches.filter((b) => urgency(b).level === "high").map((b) => b.id))} />
          <p className="mt-2 text-xs text-muted">Orange lines carry urgent food. Schematic only, not to GPS scale.</p>
        </div>

        <div className="flex flex-col gap-5">
          <p className="text-sm text-muted">Matching uses tonight’s food and each site’s remaining need. Coordinators approve every plan before volunteers are told.</p>

          <div className="flex flex-wrap items-center gap-3">
            <button className={plan ? "btn-line" : "btn-dark"} onClick={() => { setNow(new Date()); setConfirming(false); }} disabled={!available || pending}>
              {plan ? <RotateCw className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
              {plan ? "Re-run matching" : "Run matching"}
            </button>
            {plan && count > 0 && !confirming && (
              <button className="btn-dark" onClick={() => setConfirming(true)} disabled={pending}>
                <CheckCircle2 className="size-4" aria-hidden /> Approve plan
              </button>
            )}
          </div>

          {confirming && (
            <div role="alertdialog" aria-labelledby="confirm-t" className="flex flex-col gap-3 rounded-xl border border-ink p-4">
              <div>
                <p id="confirm-t" className="font-semibold">Create {count} {count === 1 ? "delivery" : "deliveries"}?</p>
                <p className="mt-0.5 text-sm text-muted">This reserves the food and adds each delivery to Live dispatch. Volunteers are assigned next.</p>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <button className="btn-dark" onClick={approve} disabled={pending} autoFocus>
                  {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {pending ? "Creating deliveries…" : `Yes, create ${count}`}
                </button>
                <button className="link" onClick={() => setConfirming(false)} disabled={pending}>Cancel</button>
              </div>
            </div>
          )}

          {plan && plan.sites.length > 0 && (
            <div className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {plan.sites.map((s) => {
                const got = (sentBySite[s.id] ?? 0) + plan.allocations.filter((a) => a.siteId === s.id).reduce((t, a) => t + a.qty, 0);
                const pct = Math.min(100, Math.round((100 * got) / s.need));
                return (
                  <div key={s.id}>
                    <div className="flex justify-between gap-2 text-[13px]"><b className="font-semibold">{siteById.get(s.id)?.name}</b><span className="font-mono">{got} / {s.need}</span></div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${pct}% of need met`}><i className={`block h-full rounded-full ${pct >= 100 ? "bg-ok" : "bg-sky"}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {plan && (count === 0 ? (
        <EmptyState icon={Route}>Nothing to allocate: either no food is waiting or every site’s need is already met.</EmptyState>
      ) : (
        <table className={cardTable}>
          <thead><tr><th className="th">Food</th><th className="th">To</th><th className="th text-right">Portions</th><th className="th">Urgency</th><th className="th text-right">Road</th><th className="th">ETA</th><th className="th">Spare time</th></tr></thead>
          <tbody>
            {rows.map(({ a, b, u }, i) => {
              const tone = a.spareMin < 20 ? "text-crit" : a.spareMin < 45 ? "text-warn" : "text-ok";
              const word = a.spareMin < 0 ? `${fmtDur(-a.spareMin)} late` : a.spareMin < 20 ? `${fmtDur(a.spareMin)} spare · very tight` : a.spareMin < 45 ? `${fmtDur(a.spareMin)} spare · tight` : `${fmtDur(a.spareMin)} spare`;
              return (
                <tr key={i}>
                  <td className="cell" data-label="Food"><b className="font-semibold">{b.food}</b></td>
                  <td className="cell" data-label="To">{siteById.get(a.siteId)?.name}</td>
                  <td className="cell font-mono md:text-right" data-label="Portions">{a.qty}</td>
                  <td className="cell" data-label="Urgency"><UrgencyPill level={u.level} /></td>
                  <td className="cell font-mono md:text-right" data-label="Road">{a.km.toFixed(1)} km</td>
                  <td className="cell font-mono" data-label="ETA">{fmtTime(a.eta)}</td>
                  <td className={`cell font-mono text-sm font-medium ${tone}`} data-label="Spare time">{word}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ))}
      {plan && plan.leftovers.length > 0 && (
        <p className="text-sm text-muted">{n0(plan.leftovers.reduce((t, l) => t + l.qty, 0))} portions are more than tonight’s known need. Add another site or hold them for a next-morning run.</p>
      )}
    </section>
  );
}
