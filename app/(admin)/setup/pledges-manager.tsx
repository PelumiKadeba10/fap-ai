"use client";
import { useState } from "react";
import { ClipboardPaste, HandHeart, Plus } from "lucide-react";
import type { CollectionPoint, Pledge } from "@/lib/types";
import { fmtDateTime, fromLagosInput, toLagosInput } from "@/lib/format";
import { PLEDGE_STATUS, byPickupTime } from "@/lib/pledges";
import { Spinner } from "@/components/spinner";
import { importPledges, removePledge, savePledge } from "../actions";
import { EmptyState, Pill, SectionCard, SectionHead, cardTable } from "../ui";
import { useAction } from "../use-action";
import { useToast } from "../toast";

type Draft = { tent_name: string; contact_name: string; contact_phone: string; pledged_packs: string; pickup_from: string; collection_point_id: string; notes: string };
const toDraft = (p: Pledge): Draft => ({
  tent_name: p.tent_name, contact_name: p.contact_name ?? "", contact_phone: p.contact_phone ?? "",
  pledged_packs: p.pledged_packs == null ? "" : String(p.pledged_packs),
  pickup_from: p.pickup_from ? toLagosInput(p.pickup_from) : "", collection_point_id: p.collection_point_id ?? "", notes: p.notes ?? "",
});
const toInput = (d: Draft) => ({
  tent_name: d.tent_name, contact_name: d.contact_name.trim() || null, contact_phone: d.contact_phone.trim() || null,
  pledged_packs: d.pledged_packs.trim() === "" ? null : Number(d.pledged_packs),
  pickup_from: d.pickup_from ? fromLagosInput(d.pickup_from) : null,
  collection_point_id: d.collection_point_id || null, notes: d.notes.trim() || null,
});
const EMPTY: Draft = { tent_name: "", contact_name: "", contact_phone: "", pledged_packs: "", pickup_from: "", collection_point_id: "", notes: "" };

/** Tents that promised food. Each one is collected at its pick-up time and brought to a collection point. */
export function PledgesManager({ pledges, points, defaultPickup }: { pledges: Pledge[]; points: CollectionPoint[]; defaultPickup: string }) {
  const toast = useToast();
  const { pending, busy, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [pastePoint, setPastePoint] = useState("");
  const [pasteTime, setPasteTime] = useState(defaultPickup);
  const active = points.filter((p) => p.active);

  return (
    <SectionCard id="pledges" title="Pledged tents" icon={HandHeart} accent="red" count={pledges.length} aside="The collection point’s lead sees them on the Pick-ups tab of their link.">

      {pledges.length > 0 || adding ? (
        <table className={cardTable}>
          <thead><tr><th className="th">Tent</th><th className="th">Contact</th><th className="th">Phone</th><th className="th">Packs</th><th className="th">Pick up from</th><th className="th">Collection point</th><th className="th">Status</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {byPickupTime(pledges).map((p) => (
              <PledgeRow key={p.id} pledge={p} points={active} pending={pending} saving={busy("save:" + p.id)} removing={busy("remove:" + p.id)}
                onSave={(d) => run("save:" + p.id, () => savePledge({ id: p.id, ...toInput(d) }))}
                onRemove={() => run("remove:" + p.id, () => removePledge(p.id))} />
            ))}
            {adding && <PledgeRow pledge={null} points={active} pending={pending} saving={busy("save:new")} removing={false} onRemove={() => setAdding(false)}
              onSave={(d) => run("save:new", () => savePledge(toInput(d)), () => setAdding(false))} />}
          </tbody>
        </table>
      ) : (
        <EmptyState icon={HandHeart}>No pledged tents yet. Add them one by one, or paste a list.</EmptyState>
      )}

      <div className="flex flex-wrap gap-3">
        {!adding && (
          <button className="flex items-center gap-2 rounded-lg border border-dashed border-[#dde2e7] px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:border-[#b9c1c9] hover:text-ink max-md:min-h-11" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> Add pledged tent
          </button>
        )}
        <button className="flex items-center gap-2 rounded-lg border border-dashed border-[#dde2e7] px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:border-[#b9c1c9] hover:text-ink max-md:min-h-11" onClick={() => setPasting((v) => !v)} aria-expanded={pasting}>
          <ClipboardPaste className="size-4" aria-hidden /> Paste a list
        </button>
      </div>

      {pasting && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-4">
          <SectionHead title="Paste a list" aside="one tent per line: Tent name, phone, packs" />
          <textarea className="input min-h-32 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} aria-label="Pledged tents, one per line"
            placeholder={"Tent 4, 08031234567, 200\nHall B tent, 08098765432, 150"} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="label">Collection point
              <select className="input" value={pastePoint} onChange={(e) => setPastePoint(e.target.value)}>
                <option value="">Not set yet</option>
                {active.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="label">Pick up from<input className="input" type="datetime-local" value={pasteTime} onChange={(e) => setPasteTime(e.target.value)} /></label>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button className="btn-dark" disabled={pending || !text.trim()} aria-busy={busy("paste")}
              onClick={() => run("paste", () => importPledges(text, pastePoint || null, pasteTime ? fromLagosInput(pasteTime) : null), () => { setText(""); setPasting(false); toast(true, "Pledged tents added"); })}>
              {busy("paste") && <Spinner />}{busy("paste") ? "Adding…" : "Add these tents"}
            </button>
            <button className="link" onClick={() => setPasting(false)}>Cancel</button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function PledgeRow({ pledge, points, pending, saving, removing, onSave, onRemove }: {
  pledge: Pledge | null; points: CollectionPoint[]; pending: boolean; saving: boolean; removing: boolean; onSave: (d: Draft) => void; onRemove: () => void;
}) {
  const isNew = !pledge;
  const [d, setD] = useState<Draft>(pledge ? toDraft(pledge) : EMPTY);
  const [confirm, setConfirm] = useState(false);
  const commit = () => { if (pledge && d.tent_name.trim() && JSON.stringify(toDraft(pledge)) !== JSON.stringify(d)) onSave(d); };
  const nm = d.tent_name || "new tent";
  const st = pledge ? PLEDGE_STATUS[pledge.status] : null;

  return (
    <tr className={isNew ? "bg-soft" : ""}>
      <td className="cell max-md:col-span-2" data-label="Tent"><input aria-label="Tent name" className="input-quiet min-w-32 font-medium" value={d.tent_name} placeholder="e.g. Tent 4" autoFocus={isNew} onChange={(e) => setD({ ...d, tent_name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Contact"><input aria-label={`Contact name for ${nm}`} className="input-quiet min-w-28" value={d.contact_name} placeholder="Name" onChange={(e) => setD({ ...d, contact_name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Phone"><input aria-label={`Phone for ${nm}`} className="input-quiet min-w-32 font-mono" type="tel" value={d.contact_phone} placeholder="0803…" onChange={(e) => setD({ ...d, contact_phone: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Packs"><input aria-label={`Pledged packs for ${nm}`} className="input-quiet w-20 font-mono max-md:w-full" type="number" inputMode="numeric" min={0} value={d.pledged_packs} placeholder="0" onChange={(e) => setD({ ...d, pledged_packs: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Pick up from"><input aria-label={`Pick-up time for ${nm}`} className="input-quiet" type="datetime-local" value={d.pickup_from} onChange={(e) => setD({ ...d, pickup_from: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Collection point">
        <select aria-label={`Collection point for ${nm}`} className="input-quiet" value={d.collection_point_id} onChange={(e) => setD({ ...d, collection_point_id: e.target.value })} onBlur={commit}>
          <option value="">Not set</option>
          {points.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td className="cell" data-label="Status">
        {st && pledge ? (
          <span className="flex flex-col gap-0.5">
            <Pill tone={st.tone}>{st.label}</Pill>
            {pledge.status === "picked_up" && pledge.picked_up_at && <span className="font-mono text-xs text-muted">{pledge.picked_up_packs ?? "?"} packs · {fmtDateTime(pledge.picked_up_at)}</span>}
          </span>
        ) : <span className="text-[13px] text-muted">New</span>}
      </td>
      <td className="cell" data-label="">
        {isNew ? (
          <div className="flex items-center gap-3">
            <button className="btn-dark min-h-9 py-1.5" disabled={pending || !d.tent_name.trim()} aria-busy={saving} onClick={() => onSave(d)}>{saving && <Spinner />}{saving ? "Saving…" : "Save"}</button>
            <button className="link" onClick={onRemove}>Cancel</button>
          </div>
        ) : confirm ? (
          <span className="flex items-center gap-3">
            <button className="link-danger inline-flex items-center gap-1.5" disabled={pending} aria-busy={removing} onClick={onRemove}>{removing && <Spinner className="size-3.5" />}{removing ? "Removing…" : "Yes, remove"}</button>
            <button className="link" onClick={() => setConfirm(false)}>Keep</button>
          </span>
        ) : (
          <span className="flex items-center gap-3">
            <button className="link-danger" disabled={pending} onClick={() => setConfirm(true)} aria-label={`Remove ${nm}`}>Remove</button>
            {saving && <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status"><Spinner className="size-3.5" />Saving…</span>}
          </span>
        )}
      </td>
    </tr>
  );
}
