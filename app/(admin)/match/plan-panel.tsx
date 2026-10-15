"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Batch, Site } from "@/lib/types";
import { runMatching } from "@/lib/match";
import { urgency } from "@/lib/urgency";
import { fmtDur, fmtTime, n0 } from "@/lib/format";
import { approvePlan } from "../actions";
import { UrgencyPill, cardTable } from "../ui";
import { SiteMap } from "./site-map";

export function PlanPanel({ batches, sites, sentByBatch, sentBySite }: {
  batches: Batch[]; sites: Site[]; sentByBatch: Record<string, number>; sentBySite: Record<string, number>;
}) {
  const router = useRouter();
  const [now, setNow] = useState<Date | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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

  function approve() {
    start(async () => {
      const r = await approvePlan();
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: `${r.created} deliveries created. Assign volunteers on Live dispatch.` });
      setNow(null);
      router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold">Recommended allocation</h2>
        <span className="text-[13px] text-muted">{n0(available)} portions not yet sent out</span>
      </div>
      <div className="grid gap-7 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <SiteMap sites={sites} allocations={plan?.allocations ?? []} urgentBatchIds={new Set(batches.filter((b) => urgency(b).level === "high").map((b) => b.id))} />
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted">Matching uses tonight’s food and each site’s remaining need. Coordinators approve every plan before volunteers are told.</p>
          <div className="flex flex-wrap gap-3">
            <button className="btn-dark" onClick={() => { setNow(new Date()); setMsg(null); }} disabled={!available}>{plan ? "Re-run matching" : "Run matching"}</button>
            {plan && plan.allocations.length > 0 && <button className="btn-line" onClick={approve} disabled={pending}>{pending ? "Creating deliveries…" : "Approve plan"}</button>}
          </div>
          {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-crit"}`}>{msg.text}</p>}
          {plan && plan.sites.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {plan.sites.map((s) => {
                const got = (sentBySite[s.id] ?? 0) + plan.allocations.filter((a) => a.siteId === s.id).reduce((t, a) => t + a.qty, 0);
                const pct = Math.min(100, Math.round((100 * got) / s.need));
                return (
                  <div key={s.id}>
                    <div className="flex justify-between text-[13px]"><b className="font-semibold">{siteById.get(s.id)?.name}</b><span className="font-mono">{got} / {s.need}</span></div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-line"><i className={`block h-full rounded-full ${pct >= 100 ? "bg-ok" : "bg-sky"}`} style={{ width: `${pct}%` }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {plan && (plan.allocations.length === 0 ? (
        <div className="empty">Nothing to allocate: either no food is waiting or every site’s need is already met.</div>
      ) : (
        <table className={cardTable}>
          <thead><tr><th className="th">Food</th><th className="th">To</th><th className="th text-right">Portions</th><th className="th">Urgency</th><th className="th text-right">Road</th><th className="th">ETA</th><th className="th">Before spoilage</th></tr></thead>
          <tbody>
            {plan.allocations.map((a, i) => {
              const b = batchById.get(a.batchId)!;
              const u = urgency(b, now!);
              return (
                <tr key={i}>
                  <td className="cell" data-label="Food"><b className="font-semibold">{b.food}</b></td>
                  <td className="cell" data-label="To">{siteById.get(a.siteId)?.name}</td>
                  <td className="cell font-mono md:text-right" data-label="Portions">{a.qty}</td>
                  <td className="cell" data-label="Urgency"><UrgencyPill level={u.level} /></td>
                  <td className="cell font-mono md:text-right" data-label="Road">{a.km.toFixed(1)} km</td>
                  <td className="cell font-mono" data-label="ETA">{fmtTime(a.eta)}</td>
                  <td className={`cell font-mono ${a.spareMin < 20 ? "text-crit" : a.spareMin < 45 ? "text-warn" : "text-ok"}`} data-label="Before spoilage">{a.spareMin < 0 ? `${fmtDur(-a.spareMin)} late` : `${fmtDur(a.spareMin)} spare`}</td>
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
