"use client";
import { useEffect, useState } from "react";
import { Check, Copy, MapPinned, MessageCircle, Plus, Trash2 } from "lucide-react";
import type { CollectionPoint } from "@/lib/types";
import { deleteCollectionPoint, saveCollectionPoint, setCollectionPointActive } from "../actions";
import { EmptyState, Pill, SectionCard, cardTable } from "../ui";
import { Spinner } from "@/components/spinner";
import { useToast } from "../toast";
import { useAction } from "../use-action";

const ACT = "btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11";

type Draft = { name: string; location_note: string; lead_name: string; lead_phone: string; volunteers: string };
const toDraft = (p: CollectionPoint): Draft => ({ name: p.name, location_note: p.location_note ?? "", lead_name: p.lead_name ?? "", lead_phone: p.lead_phone ?? "", volunteers: p.volunteers == null ? "" : String(p.volunteers) });
const toInput = (d: Draft) => ({ ...d, volunteers: d.volunteers.trim() === "" ? null : Number(d.volunteers) });

export function CollectionPointsManager({ points, siteUrl }: { points: CollectionPoint[]; siteUrl: string }) {
  const toast = useToast();
  const { pending, busy, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState(siteUrl);
  useEffect(() => { if (!siteUrl) setOrigin(window.location.origin); }, [siteUrl]);

  const reportLink = (p: CollectionPoint) => `${origin}/r/${p.token}`;
  const intakeLink = (p: CollectionPoint) => `${origin}/i/${p.intake_token}`;
  function whatsapp(p: CollectionPoint) {
    const text = `FAP: report the food collected at ${p.name} here. Type what you collected and tap Send: ${reportLink(p)}`;
    const phone = (p.lead_phone ?? "").replace(/\D/g, "").replace(/^0/, "234");
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
  async function copy(p: CollectionPoint, kind: "report" | "intake") {
    try { await navigator.clipboard.writeText(kind === "report" ? reportLink(p) : intakeLink(p)); setCopied(`${p.id}:${kind}`); setTimeout(() => setCopied(""), 1500); toast(true, "Link copied"); } catch { toast(false, "Couldn’t copy. Long-press the link instead."); }
  }

  return (
    <SectionCard id="collection-points" title="Collection points for this event" icon={MapPinned} accent="orange" count={points.length} aside="Each point gets separate Report Food and Food Intake Record links. No login needed.">
      {points.length > 0 || adding ? (
        <table className={cardTable}>
          <thead><tr><th className="th">Collection point</th><th className="th">Location note</th><th className="th">Lead</th><th className="th">Lead phone</th><th className="th">Volunteers</th><th className="th">Link</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {points.map((p) => (
              <PointRow key={p.id} point={p} pending={pending} saving={busy("save:" + p.id)} toggling={busy("toggle:" + p.id)} deleting={busy("delete:" + p.id)}
                onSave={(d) => run("save:" + p.id, () => saveCollectionPoint({ id: p.id, ...toInput(d) }))}
                onToggle={() => run("toggle:" + p.id, () => setCollectionPointActive(p.id, !p.active))}
                onDelete={() => { if (window.confirm(`Delete “${p.name}” permanently? Its food reports will remain but lose this collection point label.`)) run("delete:" + p.id, () => deleteCollectionPoint(p.id)); }}
                actions={p.active ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button className={ACT} onClick={() => copy(p, "report")}>
                      {copied === `${p.id}:report` ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied === `${p.id}:report` ? "Copied" : "Report link"}
                    </button>
                    <button className={ACT} onClick={() => copy(p, "intake")}>
                      {copied === `${p.id}:intake` ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                      {copied === `${p.id}:intake` ? "Copied" : "Intake link"}
                    </button>
                    <a className={ACT} href={whatsapp(p)} target="_blank" rel="noreferrer"><MessageCircle className="size-4" aria-hidden />WhatsApp</a>
                  </div>
                ) : <Pill tone="muted">Switched off</Pill>}
              />
            ))}
            {adding && (
              <PointRow point={null} pending={pending} saving={busy("save:new")} toggling={false} deleting={false} onDelete={() => setAdding(false)} onToggle={() => setAdding(false)}
                onSave={(d) => run("save:new", () => saveCollectionPoint(toInput(d)), () => setAdding(false))} actions={null} />
            )}
          </tbody>
        </table>
      ) : (
        <EmptyState icon={MapPinned}>No collection points for this event yet. Add one for each vendor or pick-up spot.</EmptyState>
      )}
      {!adding && (
        <button className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#dde2e7] px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:border-[#b9c1c9] hover:text-ink" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add collection point
        </button>
      )}
    </SectionCard>
  );
}

function PointRow({ point, pending, saving, toggling, deleting, onSave, onToggle, onDelete, actions }: {
  point: CollectionPoint | null; pending: boolean; saving: boolean; toggling: boolean; deleting: boolean; onSave: (d: Draft) => void; onToggle: () => void; onDelete: () => void; actions: React.ReactNode;
}) {
  const isNew = !point;
  const [d, setD] = useState<Draft>(point ? toDraft(point) : { name: "", location_note: "", lead_name: "", lead_phone: "", volunteers: "" });
  const commit = () => { if (point && d.name.trim() && JSON.stringify(toDraft(point)) !== JSON.stringify(d)) onSave(d); };
  const nm = d.name || "new collection point";
  const dim = point && !point.active ? "opacity-60" : "";

  return (
    <tr className={isNew ? "bg-soft" : dim}>
      <td className="cell max-md:col-span-2" data-label="Collection point"><input aria-label="Collection point name" className="input-quiet min-w-40 font-medium" value={d.name} placeholder="e.g. Vendor 3 – Cafeteria" autoFocus={isNew} onChange={(e) => setD({ ...d, name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Location note"><input aria-label={`Location note for ${nm}`} className="input-quiet min-w-36" value={d.location_note} placeholder="Where to find it" onChange={(e) => setD({ ...d, location_note: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead"><input aria-label={`Lead name for ${nm}`} className="input-quiet min-w-28" value={d.lead_name} placeholder="Name" onChange={(e) => setD({ ...d, lead_name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead phone"><input aria-label={`Lead phone for ${nm}`} className="input-quiet min-w-32 font-mono" type="tel" value={d.lead_phone} placeholder="0803…" onChange={(e) => setD({ ...d, lead_phone: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Volunteers"><input aria-label={`Volunteers at ${nm}`} className="input-quiet w-20 font-mono max-md:w-full" type="number" inputMode="numeric" min={0} value={d.volunteers} placeholder="0" onChange={(e) => setD({ ...d, volunteers: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Link">{actions}</td>
      <td className="cell" data-label="">
        {isNew ? (
          <div className="flex items-center gap-3">
            <button className="btn-dark min-h-9 py-1.5" disabled={pending || !d.name.trim()} aria-busy={saving} onClick={() => onSave(d)}>{saving && <Spinner />}{saving ? "Saving…" : "Save"}</button>
            <button className="link" onClick={onToggle}>Cancel</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button className={`${point.active ? "link-danger" : "link"} inline-flex items-center gap-1.5`} disabled={pending} aria-busy={toggling} onClick={onToggle} aria-label={`${point.active ? "Switch off" : "Switch on"} ${nm}`}>
              {toggling && <Spinner className="size-3.5" />}{toggling ? "Saving…" : point.active ? "Switch off" : "Switch on"}
            </button>
            <button className="link-danger inline-flex items-center gap-1.5" disabled={pending} aria-busy={deleting} onClick={onDelete} aria-label={`Delete ${nm}`} title={`Delete ${nm}`}>
              {deleting ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" aria-hidden />}{deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
