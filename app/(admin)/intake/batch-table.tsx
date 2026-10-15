"use client";
import { useState, useTransition } from "react";
import type { Batch } from "@/lib/types";
import { CATEGORIES, urgency } from "@/lib/urgency";
import { fmtDur, fmtTime, n0 } from "@/lib/format";
import { removeBatch } from "../actions";
import { UrgencyPill, cardTable } from "../ui";

export function BatchTable({ batches, sent }: { batches: Batch[]; sent: Record<string, number> }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const now = new Date();
  const total = batches.reduce((t, b) => t + b.qty, 0);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-semibold">Recovered batches</h2>
        <span className="text-[13px] text-muted">{batches.length} batches · {n0(total)} portions</span>
      </div>
      {error && <p className="text-sm text-crit">{error}</p>}
      {batches.length === 0 ? (
        <div className="empty">No food logged yet. Parse the first volunteer message above.</div>
      ) : (
        <table className={cardTable}>
          <thead>
            <tr><th className="th">Food</th><th className="th text-right">Portions</th><th className="th">Sent out</th><th className="th">Collected</th><th className="th">Location</th><th className="th">Urgency</th><th className="th">Safe for</th><th className="th"></th></tr>
          </thead>
          <tbody>
            {batches.map((b) => {
              const u = urgency(b, now);
              const out = sent[b.id] ?? 0;
              return (
                <tr key={b.id}>
                  <td className="cell" data-label="Food"><b className="font-semibold">{b.food}</b><div className="text-xs text-muted">{CATEGORIES[b.category].label}{b.condition ? ` · ${b.condition}` : ""}</div></td>
                  <td className="cell font-mono md:text-right" data-label="Portions">{n0(b.qty)}</td>
                  <td className="cell font-mono" data-label="Sent out">{out ? `${n0(out)}` : "—"}</td>
                  <td className="cell font-mono" data-label="Collected">{fmtTime(b.collected_at)}</td>
                  <td className="cell" data-label="Location">{b.location}</td>
                  <td className="cell" data-label="Urgency"><UrgencyPill level={u.level} score={u.score} /></td>
                  <td className="cell font-mono" data-label="Safe for">{u.minutesLeft > 0 ? fmtDur(u.minutesLeft) : <span className="text-crit">expired</span>}</td>
                  <td className="cell" data-label="">
                    {out === 0 && (
                      <button className="link" disabled={pending} onClick={() => start(async () => { const r = await removeBatch(b.id); setError(r.ok ? "" : r.error); })}>
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
