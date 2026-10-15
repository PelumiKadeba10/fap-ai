"use client";
import { useState, useTransition } from "react";
import { Bus as BusIcon, Plus } from "lucide-react";
import type { Bus } from "@/lib/types";
import { saveBus, setBusActive } from "../actions";
import { EmptyState, Pill, SectionHead, cardTable } from "../ui";
import { useToast } from "../toast";

type Draft = { name: string; capacity: number; lead_name: string; lead_phone: string };
const toDraft = (b: Bus): Draft => ({ name: b.name, capacity: b.capacity, lead_name: b.lead_name ?? "", lead_phone: b.lead_phone ?? "" });

/** Add, edit and switch off buses. Buses are shared by every event. */
export function BusesManager({ buses, busyIds }: { buses: Bus[]; busyIds: string[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(false, r.error ?? "Something went wrong.");
      after?.();
    });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="buses-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="buses-title" className="h2">Buses</h2>
        <span className="text-[13px] text-muted">Shared by every event. Each bus lead gets a trip link, no login needed.</span>
      </div>
      {buses.length > 0 || adding ? (
        <table className={cardTable}>
          <thead><tr><th className="th">Bus</th><th className="th">Capacity (packs)</th><th className="th">Lead</th><th className="th">Lead phone</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {buses.map((b) => (
              <BusRow key={b.id} bus={b} pending={pending} busy={busyIds.includes(b.id)}
                onSave={(d) => run(() => saveBus({ id: b.id, ...d }))}
                onToggle={() => run(() => setBusActive(b.id, !b.active))} />
            ))}
            {adding && <BusRow bus={null} pending={pending} busy={false} onToggle={() => setAdding(false)} onSave={(d) => run(() => saveBus(d), () => setAdding(false))} />}
          </tbody>
        </table>
      ) : (
        <EmptyState icon={BusIcon}>No buses yet. Add the buses that will carry food between collection points and places.</EmptyState>
      )}
      {!adding && (
        <button className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#dde2e7] px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:border-[#b9c1c9] hover:text-ink" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add bus
        </button>
      )}
    </section>
  );
}

function BusRow({ bus, pending, busy, onSave, onToggle }: { bus: Bus | null; pending: boolean; busy: boolean; onSave: (d: Draft) => void; onToggle: () => void }) {
  const isNew = !bus;
  const [d, setD] = useState<Draft>(bus ? toDraft(bus) : { name: "", capacity: 400, lead_name: "", lead_phone: "" });
  const commit = () => { if (bus && d.name.trim() && d.capacity > 0 && JSON.stringify(toDraft(bus)) !== JSON.stringify(d)) onSave(d); };
  const nm = d.name || "new bus";

  return (
    <tr className={isNew ? "bg-soft" : bus.active ? "" : "opacity-60"}>
      <td className="cell" data-label="Bus"><input aria-label="Bus name" className="input-quiet min-w-28 font-medium" value={d.name} placeholder="Bus 1" autoFocus={isNew} onChange={(e) => setD({ ...d, name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Capacity (packs)"><input aria-label={`Capacity of ${nm}`} className="input-quiet w-24 font-mono max-md:w-full" type="number" min={1} step={50} value={d.capacity || ""} onChange={(e) => setD({ ...d, capacity: Number(e.target.value) })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead"><input aria-label={`Lead name for ${nm}`} className="input-quiet min-w-28" value={d.lead_name} placeholder="Name" onChange={(e) => setD({ ...d, lead_name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead phone"><input aria-label={`Lead phone for ${nm}`} className="input-quiet min-w-32 font-mono" type="tel" value={d.lead_phone} placeholder="0803…" onChange={(e) => setD({ ...d, lead_phone: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="">
        {isNew ? (
          <div className="flex items-center gap-3">
            <button className="btn-dark min-h-9 py-1.5" disabled={pending || !d.name.trim() || d.capacity < 1} onClick={() => onSave(d)}>Save</button>
            <button className="link" onClick={onToggle}>Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {busy && <Pill tone="blue">On a trip</Pill>}
            <button className={bus.active ? "link-danger" : "link"} disabled={pending || busy} onClick={onToggle} aria-label={`${bus.active ? "Switch off" : "Switch on"} ${nm}`}>
              {bus.active ? "Switch off" : "Switch on"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
