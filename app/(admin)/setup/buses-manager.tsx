"use client";
import { useEffect, useState } from "react";
import { Bus as BusIcon, Check, Copy, MessageCircle, Plus } from "lucide-react";
import type { Bus } from "@/lib/types";
import { Spinner } from "@/components/spinner";
import { saveBus, setBusActive } from "../actions";
import { EmptyState, Pill, cardTable } from "../ui";
import { useAction } from "../use-action";
import { useToast } from "../toast";

const ACT = "btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11";

type Draft = { name: string; capacity: number; lead_name: string; lead_phone: string };
const toDraft = (b: Bus): Draft => ({ name: b.name, capacity: b.capacity, lead_name: b.lead_name ?? "", lead_phone: b.lead_phone ?? "" });

/** This event's buses. Each bus has one link for the whole event, shown here to copy or send. */
export function BusesManager({ buses, links, busyIds, siteUrl, eventName }: {
  buses: Bus[]; links: { bus_id: string; token: string }[]; busyIds: string[]; siteUrl: string; eventName: string;
}) {
  const toast = useToast();
  const { pending, busy: isBusy, run } = useAction();
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState(siteUrl);
  useEffect(() => { if (!siteUrl) setOrigin(window.location.origin); }, [siteUrl]);

  const linkOf = (b: Bus) => { const l = links.find((x) => x.bus_id === b.id); return l ? origin + "/b/" + l.token : null; };
  function whatsapp(b: Bus, url: string) {
    const text = "FAP: this is your bus link for " + eventName + ". Keep it open, your trips appear on it: " + url;
    const phone = (b.lead_phone ?? "").replace(/\D/g, "").replace(/^0/, "234");
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }
  async function copy(b: Bus, url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(b.id); setTimeout(() => setCopied(""), 1500); toast(true, "Link copied"); } catch { toast(false, "Couldn’t copy. Long-press the link instead."); }
  }

  return (
    <section id="buses" className="flex scroll-mt-24 flex-col gap-4" aria-labelledby="buses-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="buses-title" className="h2">Buses for this event</h2>
        <span className="text-[13px] text-muted">One link per bus lead for the whole event, no login needed.</span>
      </div>
      {buses.length > 0 || adding ? (
        <table className={cardTable}>
          <thead><tr><th className="th">Bus</th><th className="th">Capacity (packs)</th><th className="th">Lead</th><th className="th">Lead phone</th><th className="th">Bus link</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {buses.map((b) => {
              const url = linkOf(b);
              return (
                <BusRow key={b.id} bus={b} pending={pending} onTrip={busyIds.includes(b.id)} saving={isBusy("save:" + b.id)} toggling={isBusy("toggle:" + b.id)}
                  onSave={(d) => run("save:" + b.id, () => saveBus({ id: b.id, ...d }))}
                  onToggle={() => run("toggle:" + b.id, () => setBusActive(b.id, !b.active))}
                  links={b.active && url ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button className={ACT} onClick={() => copy(b, url)}>
                        {copied === b.id ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                        {copied === b.id ? "Copied" : "Copy link"}
                      </button>
                      <a className={ACT} href={whatsapp(b, url)} target="_blank" rel="noreferrer"><MessageCircle className="size-4" aria-hidden />WhatsApp</a>
                    </div>
                  ) : b.active ? <span className="text-[13px] text-muted">Link is being prepared…</span> : <Pill tone="muted">Switched off</Pill>} />
              );
            })}
            {adding && <BusRow bus={null} pending={pending} onTrip={false} saving={isBusy("save:new")} toggling={false} links={null} onToggle={() => setAdding(false)} onSave={(d) => run("save:new", () => saveBus(d), () => setAdding(false))} />}
          </tbody>
        </table>
      ) : (
        <EmptyState icon={BusIcon}>No buses for this event yet. Add the buses that will carry food between collection points and places.</EmptyState>
      )}
      {!adding && (
        <button className="flex w-full items-center gap-2 rounded-lg border border-dashed border-[#dde2e7] px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:border-[#b9c1c9] hover:text-ink" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Add bus
        </button>
      )}
    </section>
  );
}

function BusRow({ bus, pending, onTrip, saving, toggling, links, onSave, onToggle }: {
  bus: Bus | null; pending: boolean; onTrip: boolean; saving: boolean; toggling: boolean; links: React.ReactNode; onSave: (d: Draft) => void; onToggle: () => void;
}) {
  const isNew = !bus;
  const [d, setD] = useState<Draft>(bus ? toDraft(bus) : { name: "", capacity: 400, lead_name: "", lead_phone: "" });
  const commit = () => { if (bus && d.name.trim() && d.capacity > 0 && JSON.stringify(toDraft(bus)) !== JSON.stringify(d)) onSave(d); };
  const nm = d.name || "new bus";

  return (
    <tr className={isNew ? "bg-soft" : bus.active ? "" : "opacity-60"}>
      <td className="cell" data-label="Bus"><input aria-label="Bus name" className="input-quiet min-w-28 font-medium" value={d.name} placeholder="Bus 1" autoFocus={isNew} onChange={(e) => setD({ ...d, name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Capacity (packs)"><input aria-label={"Capacity of " + nm} className="input-quiet w-24 font-mono max-md:w-full" type="number" min={1} step={50} value={d.capacity || ""} onChange={(e) => setD({ ...d, capacity: Number(e.target.value) })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead"><input aria-label={"Lead name for " + nm} className="input-quiet min-w-28" value={d.lead_name} placeholder="Name" onChange={(e) => setD({ ...d, lead_name: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Lead phone"><input aria-label={"Lead phone for " + nm} className="input-quiet min-w-32 font-mono" type="tel" value={d.lead_phone} placeholder="0803…" onChange={(e) => setD({ ...d, lead_phone: e.target.value })} onBlur={commit} /></td>
      <td className="cell" data-label="Bus link">{links ?? <span className="text-[13px] text-muted">Created when saved</span>}</td>
      <td className="cell" data-label="">
        {isNew ? (
          <div className="flex items-center gap-3">
            <button className="btn-dark min-h-9 py-1.5" disabled={pending || !d.name.trim() || d.capacity < 1} aria-busy={saving} onClick={() => onSave(d)}>{saving && <Spinner />}{saving ? "Saving…" : "Save"}</button>
            <button className="link" onClick={onToggle}>Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {onTrip && <Pill tone="blue">On a trip</Pill>}
            <button className={(bus.active ? "link-danger" : "link") + " inline-flex items-center gap-1.5"} disabled={pending || onTrip} aria-busy={toggling} onClick={onToggle} aria-label={(bus.active ? "Switch off " : "Switch on ") + nm}>
              {toggling && <Spinner className="size-3.5" />}{toggling ? "Saving…" : bus.active ? "Switch off" : "Switch on"}
            </button>
            {saving && <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status"><Spinner className="size-3.5" />Saving…</span>}
          </div>
        )}
      </td>
    </tr>
  );
}
