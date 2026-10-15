"use client";
import { useEffect, useState, useTransition } from "react";
import { Check, Copy, MapPinned, MessageCircle, Plus } from "lucide-react";
import type { CollectionPoint } from "@/lib/types";
import { saveCollectionPoint, setCollectionPointActive } from "../actions";
import { EmptyState, Pill, SectionHead, cardTable } from "../ui";
import { useToast } from "../toast";

const ACT = "btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11";

type Draft = { name: string; lead_name: string; lead_phone: string };
const toDraft = (p: CollectionPoint): Draft => ({ name: p.name, lead_name: p.lead_name ?? "", lead_phone: p.lead_phone ?? "" });

export function CollectionPoints({ points, siteUrl }: { points: CollectionPoint[]; siteUrl: string }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState(siteUrl);
  useEffect(() => { if (!siteUrl) setOrigin(window.location.origin); }, [siteUrl]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(false, r.error ?? "Something went wrong.");
      after?.();
    });

  const link = (p: CollectionPoint) => `${origin}/c/${p.token}`;
  function whatsapp(p: CollectionPoint) {
    const text = `FAP: report the food collected at ${p.name} here. Type what you collected and tap Send: ${link(p)}`;
    const phone = (p.lead_phone ?? "").replace(/\D/g, "").replace(/^0/, "234");
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
  async function copy(p: CollectionPoint) {
    try { await navigator.clipboard.writeText(link(p)); setCopied(p.id); setTimeout(() => setCopied(""), 1500); toast(true, "Link copied"); } catch { toast(false, "Couldn’t copy. Long-press the link instead."); }
  }

  return (
    <section id="collection-points" className="flex scroll-mt-24 flex-col gap-4" aria-labelledby="cp-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="cp-title" className="h2">Collection points</h2>
        <span className="text-[13px] text-muted">Each lead gets a link to report food from their phone. No login needed.</span>
      </div>
      {points.length > 0 || adding ? (
        <table className={cardTable}>
          <thead><tr><th className="th">Collection point</th><th className="th">Lead</th><th className="th">Lead phone</th><th className="th">Link</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {points.map((p) => (
              <PointRow key={p.id} point={p} pending={pending}
                onSave={(d) => run(() => saveCollectionPoint({ id: p.id, ...d }))}
                onToggle={() => run(() => setCollectionPointActive(p.id, !p.active))}
                actions={p.active ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button className={ACT} onClick={() => copy(p)}>
                      {copied === p.id ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied === p.id ? "Copied" : "Copy link"}
                    </button>
                    <a className={ACT} href={whatsapp(p)} target="_blank" rel="noreferrer"><MessageCircle className="size-4" aria-hidden />WhatsApp</a>
                  </div>
                ) : <Pill tone="muted">Switched off</Pill>}
              />
            ))}
            {adding && (
              <PointRow point={null} pending={pending} onToggle={() => setAdding(false)}
                onSave={(d) => run(() => saveCollectionPoint(d), () => setAdding(false))} actions={null} />
            )}
          </tbody>
        </table>
      ) : (
        <EmptyState icon={MapPinned}>No collection points yet. Add one for each vendor or pick-up spot.</EmptyState>
      )}
      {!adding && (
        <button className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#dde2e7] px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:border-[#b9c1c9] hover:text-ink" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add collection point
        </button>
      )}
    </section>
  );
}

function PointRow({ point, pending, onSave, onToggle, actions }: {
  point: CollectionPoint | null; pending: boolean; onSave: (d: Draft) => void; onToggle: () => void; actions: React.ReactNode;
}) {
  const isNew = !point;
  const [d, setD] = useState<Draft>(point ? toDraft(point) : { name: "", lead_name: "", lead_phone: "" });
  const commit = () => { if (point && d.name.trim() && JSON.stringify(toDraft(point)) !== JSON.stringify(d)) onSave(d); };
  const nm = d.name || "new collection point";
  const dim = point && !point.active ? "opacity-60" : "";

  return (
    <tr className={isNew ? "bg-soft" : dim}>
      <td className="cell max-md:col-span-2" data-label="Collection point"><input aria-label="Collection point name" className="input-quiet min-w-40 font-medium" value={d.name} placeholder="e.g. Vendor 3 – Cafeteria" autoFocus={isNew} onChange={(e) => setD({ ...d, name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead"><input aria-label={`Lead name for ${nm}`} className="input-quiet min-w-28" value={d.lead_name} placeholder="Name" onChange={(e) => setD({ ...d, lead_name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead phone"><input aria-label={`Lead phone for ${nm}`} className="input-quiet min-w-32 font-mono" type="tel" value={d.lead_phone} placeholder="0803…" onChange={(e) => setD({ ...d, lead_phone: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Link">{actions}</td>
      <td className="cell" data-label="">
        {isNew ? (
          <div className="flex items-center gap-3">
            <button className="btn-dark min-h-9 py-1.5" disabled={pending || !d.name.trim()} onClick={() => onSave(d)}>Save</button>
            <button className="link" onClick={onToggle}>Cancel</button>
          </div>
        ) : (
          <button className={point.active ? "link-danger" : "link"} disabled={pending} onClick={onToggle} aria-label={`${point.active ? "Switch off" : "Switch on"} ${nm}`}>
            {point.active ? "Switch off" : "Switch on"}
          </button>
        )}
      </td>
    </tr>
  );
}
