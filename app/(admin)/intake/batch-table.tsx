"use client";
import type { Batch } from "@/lib/types";
import { CATEGORIES, urgency } from "@/lib/urgency";
import { fmtDur, fmtTime, n0 } from "@/lib/format";
import { removeBatch } from "../actions";
import { EmptyState, SectionCard, UrgencyPill, cardTable } from "../ui";
import { Spinner } from "@/components/spinner";
import { useAction } from "../use-action";
import { PhotoIcon } from "../photo-viewer";
import { PackageOpen } from "lucide-react";

export function BatchTable({ batches, sent, photos }: { batches: Batch[]; sent: Record<string, number>; photos: Record<string, string> }) {
  const { pending, busy, run } = useAction();
  const now = new Date();
  const total = batches.reduce((t, b) => t + b.qty, 0);
  const newest = [...batches].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <SectionCard id="recovered" title="Recovered batches" icon={PackageOpen} accent="green" count={batches.length} aside={<><span className="font-mono">{n0(total)}</span> portions</>}>
      {batches.length === 0 ? (
        <EmptyState icon={PackageOpen}>No food confirmed yet. Confirm what the collection points send, and it shows up here.</EmptyState>
      ) : (
        <table className={cardTable}>
          <thead>
            <tr><th className="th">Food</th><th className="th text-right">Portions</th><th className="th">Sent out</th><th className="th">Collected</th><th className="th">Location</th><th className="th">Urgency</th><th className="th">Safe for</th><th className="th"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {newest.map((b) => {
              const u = urgency(b, now);
              const out = sent[b.id] ?? 0;
              return (
                <tr key={b.id}>
                  <td className="cell" data-label="Food"><b className="font-semibold">{b.food}</b>{photos[b.id] && <span className="ml-1 inline-block align-middle"><PhotoIcon src={photos[b.id]} label={`${b.food}, ${b.location}`} /></span>}<div className="text-[13px] text-muted">{CATEGORIES[b.category].label}{b.condition ? ` · ${b.condition}` : ""}</div></td>
                  <td className="cell font-mono md:text-right" data-label="Portions">{n0(b.qty)}</td>
                  <td className="cell font-mono" data-label="Sent out">{out ? `${n0(out)}` : "—"}</td>
                  <td className="cell font-mono" data-label="Collected">{fmtTime(b.collected_at)}</td>
                  <td className="cell" data-label="Location">{b.location}</td>
                  <td className="cell" data-label="Urgency"><UrgencyPill level={u.level} score={u.score} /></td>
                  <td className="cell font-mono" data-label="Safe for">{u.minutesLeft > 0 ? fmtDur(u.minutesLeft) : <span className="font-sans font-medium text-crit">Expired</span>}</td>
                  <td className="cell" data-label="">
                    {out === 0 && (
                      <button className="link-danger inline-flex items-center gap-1.5" disabled={pending} aria-busy={busy(b.id)} aria-label={`Remove ${b.food}`} onClick={() => run(b.id, () => removeBatch(b.id))}>
                        {busy(b.id) && <Spinner className="size-3.5" />}{busy(b.id) ? "Removing…" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </SectionCard>
  );
}
