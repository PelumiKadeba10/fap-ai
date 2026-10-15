"use client";
import { useState, useTransition } from "react";
import { AlertTriangle, Check, Copy, MessageCircle, UserPlus } from "lucide-react";
import type { Batch, Delivery, DeliveryStatus, Site, Volunteer } from "@/lib/types";
import { ATTENTION_MIN, NEXT_STATUS, STATUS } from "@/lib/status";
import { fmtDur, fmtTime, minutesBetween } from "@/lib/format";
import { addVolunteer, assignVolunteer, setStatusAsStaff } from "../actions";
import { Pill, SectionHead, StatusPill, cardTable } from "../ui";
import { useToast } from "../toast";

const ACT = "btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11";

/** Deliveries made before trips existed, or outside a trip: one volunteer, one /v/ link each. */
export function DirectDeliveries({ deliveries, batches, sites, volunteers, now, origin }: {
  deliveries: Delivery[]; batches: Batch[]; sites: Site[]; volunteers: Volunteer[]; now: Date; origin: string;
}) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState("");
  const batch = new Map(batches.map((b) => [b.id, b]));
  const site = new Map(sites.map((s) => [s.id, s]));
  const vol = new Map(volunteers.map((v) => [v.id, v]));
  const left = (d: Delivery) => minutesBetween(now, d.safe_until);
  const attention = (d: Delivery) => d.status !== "delivered" && (d.status === "delayed" || left(d) < ATTENTION_MIN);
  const link = (d: Delivery) => `${origin}/v/${d.token}`;
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast(false, r.error ?? "Something went wrong."); });

  function whatsapp(d: Delivery) {
    const v = d.volunteer_id ? vol.get(d.volunteer_id) : null;
    const text = `FAP delivery: ${d.qty} portions of ${batch.get(d.batch_id)?.food} to ${site.get(d.site_id)?.name}. Safe until ${fmtTime(d.safe_until)}. Tap to update your status: ${link(d)}`;
    const phone = (v?.phone ?? "").replace(/\D/g, "").replace(/^0/, "234");
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
  async function copy(d: Delivery) {
    try { await navigator.clipboard.writeText(link(d)); setCopied(d.id); setTimeout(() => setCopied(""), 1500); toast(true, "Link copied"); } catch { toast(false, "Couldn’t copy. Long-press the link instead."); }
  }

  return (
    <div className="flex flex-col gap-9">
      {deliveries.length > 0 && (
        <section className="flex flex-col gap-4">
          <SectionHead title="Direct deliveries" aside="One volunteer per delivery, outside a bus trip" />
          <table className={cardTable}>
            <thead><tr><th className="th">Food</th><th className="th">Deliver to</th><th className="th">Volunteer</th><th className="th">Status</th><th className="th">Safe until</th><th className="th">Actions</th></tr></thead>
            <tbody>
              {deliveries.map((d) => {
                const m = left(d);
                const s = site.get(d.site_id);
                const attn = attention(d);
                return (
                  <tr key={d.id} className={attn ? "bg-[#fdf6f5] max-md:border-l-4 max-md:border-l-crit max-md:pl-3" : ""}>
                    <td className="cell max-md:col-span-2" data-label="Food"><b className="font-semibold">{batch.get(d.batch_id)?.food}</b><div className="font-mono text-[13px] text-muted">{d.qty} portions</div></td>
                    <td className="cell" data-label="Deliver to">{s?.name}{s?.contact_phone && <div className="font-mono text-[13px] text-muted">{s.contact_phone}</div>}</td>
                    <td className="cell" data-label="Volunteer">
                      <select id={`vol-${d.id}`} aria-label={`Volunteer for ${d.qty} portions to ${s?.name}`} className="input py-1.5 max-md:min-h-11" value={d.volunteer_id ?? ""} disabled={pending || d.status === "delivered"}
                        onChange={(e) => run(() => assignVolunteer(d.id, e.target.value || null))}>
                        <option value="">Choose…</option>
                        {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}{v.vehicle !== "none" ? ` (${v.vehicle})` : ""}</option>)}
                      </select>
                    </td>
                    <td className="cell" data-label="Status">
                      <StatusPill status={d.status} />
                      {attn && <div className="mt-1"><Pill tone="red" icon={AlertTriangle}>{d.status === "delayed" ? "Delayed" : m > 0 ? `${fmtDur(m)} left` : `Late ${fmtDur(-m)}`}</Pill></div>}
                    </td>
                    <td className="cell" data-label="Safe until"><span className="font-mono">{fmtTime(d.safe_until)}</span>{d.status !== "delivered" && <div className="text-[13px] font-medium">{m > 0 ? `${fmtDur(m)} left` : `Late ${fmtDur(-m)}`}</div>}</td>
                    <td className="cell" data-label="Actions">
                      <div className="flex flex-wrap items-center gap-2">
                        {d.status !== "delivered" && d.volunteer_id && <a className={ACT} href={whatsapp(d)} target="_blank" rel="noreferrer"><MessageCircle className="size-4" aria-hidden />WhatsApp</a>}
                        {d.status !== "delivered" && (
                          <button className={ACT} onClick={() => copy(d)}>
                            {copied === d.id ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                            {copied === d.id ? "Copied" : "Copy link"}
                          </button>
                        )}
                        {NEXT_STATUS[d.status].map((to: DeliveryStatus) => (
                          <button key={to} className={ACT} disabled={pending} title="Update on the volunteer’s behalf" onClick={() => run(() => setStatusAsStaff(d.id, d.status, to))}>→ {STATUS[to].label}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <AddVolunteer onAdd={(v) => run(() => addVolunteer(v))} pending={pending} />
    </div>
  );
}

function AddVolunteer({ onAdd, pending }: { onAdd: (v: { name: string; phone: string | null; vehicle: "none" | "car" | "bike" }) => void; pending: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState<"none" | "car" | "bike">("none");
  return (
    <section className="flex flex-col gap-4">
      <SectionHead title="Add a volunteer" aside="For direct deliveries only" />
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); onAdd({ name, phone: phone || null, vehicle }); setName(""); setPhone(""); }}>
        <label className="label">Name<input id="nv-name" className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="label">Phone (WhatsApp)<input id="nv-phone" className="input font-mono" type="tel" placeholder="0803…" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
        <label className="label">Vehicle
          <select id="nv-vehicle" className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value as typeof vehicle)}>
            <option value="none">No vehicle</option><option value="car">Car</option><option value="bike">Bike</option>
          </select>
        </label>
        <button className="btn-line sm:col-span-3 sm:justify-self-start" disabled={pending || !name.trim()}><UserPlus className="size-4" aria-hidden />Add volunteer</button>
      </form>
    </section>
  );
}
