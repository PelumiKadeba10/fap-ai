"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Batch, Delivery, DeliveryStatus, Site, Volunteer } from "@/lib/types";
import { ATTENTION_MIN, NEXT_STATUS, STATUS } from "@/lib/status";
import { fmtDur, fmtTime, minutesBetween, n0 } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { addVolunteer, assignVolunteer, setStatusAsStaff } from "../actions";
import { StatusPill, cardTable } from "../ui";

type Update = { id: number; delivery_id: string; status: string; note: string | null; created_at: string };

export function LiveBoard({ eventId, deliveries, batches, sites, volunteers, updates, siteUrl }: {
  eventId: string; deliveries: Delivery[]; batches: Batch[]; sites: Site[]; volunteers: Volunteer[]; updates: Update[]; siteUrl: string;
}) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [pending, start] = useTransition();

  // Realtime: any change to this event's deliveries reloads the board's data.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`live-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `event_id=eq.${eventId}` }, () => router.refresh())
      .subscribe();
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [eventId, router]);

  const batch = new Map(batches.map((b) => [b.id, b]));
  const site = new Map(sites.map((s) => [s.id, s]));
  const vol = new Map(volunteers.map((v) => [v.id, v]));
  const left = (d: Delivery) => minutesBetween(now, d.safe_until);
  const needsAttention = (d: Delivery) => d.status !== "delivered" && (d.status === "delayed" || left(d) < ATTENTION_MIN);

  const delivered = deliveries.filter((d) => d.status === "delivered");
  const counts = {
    delivered: delivered.reduce((t, d) => t + d.qty, 0),
    total: deliveries.reduce((t, d) => t + d.qty, 0),
    moving: deliveries.filter((d) => d.status === "picked_up" || d.status === "on_the_way").length,
    waiting: deliveries.filter((d) => d.status === "assigned").length,
    attention: deliveries.filter(needsAttention).length,
    unassigned: deliveries.filter((d) => !d.volunteer_id && d.status !== "delivered").length,
  };

  const [origin, setOrigin] = useState(siteUrl);
  useEffect(() => { if (!siteUrl) setOrigin(window.location.origin); }, [siteUrl]);
  const link = (d: Delivery) => `${origin}/v/${d.token}`;
  function whatsapp(d: Delivery) {
    const v = d.volunteer_id ? vol.get(d.volunteer_id) : null;
    const b = batch.get(d.batch_id), s = site.get(d.site_id);
    const text = `FAP delivery: ${d.qty} portions of ${b?.food} to ${s?.name}. Safe until ${fmtTime(d.safe_until)}. Tap to update your status: ${link(d)}`;
    const phone = (v?.phone ?? "").replace(/\D/g, "").replace(/^0/, "234");
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }
  async function copy(d: Delivery) {
    try { await navigator.clipboard.writeText(link(d)); setCopied(d.id); setTimeout(() => setCopied(""), 1500); } catch { setError("Couldn’t copy. Long-press the link instead."); }
  }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); setError(r.ok ? "" : r.error ?? "Something went wrong."); });

  return (
    <>
      <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
        <Stat k="Delivered" v={n0(counts.delivered)} s={`of ${n0(counts.total)} portions`} />
        <Stat k="On the way" v={String(counts.moving)} s="deliveries" />
        <Stat k="Waiting for pickup" v={String(counts.waiting)} s={counts.unassigned ? `${counts.unassigned} without a volunteer` : "deliveries"} />
        <Stat k="Needs attention" v={String(counts.attention)} s={counts.attention ? "delayed or near safe time" : "all on track"} tone={counts.attention ? "text-crit" : "text-ok"} />
      </div>
      {error && <p className="text-sm text-crit">{error}</p>}

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Deliveries</h2>
        <table className={cardTable}>
          <thead><tr><th className="th">Food</th><th className="th">To</th><th className="th text-right">Portions</th><th className="th">Volunteer</th><th className="th">Status</th><th className="th">Safe until</th><th className="th">Send / update</th></tr></thead>
          <tbody>
            {deliveries.map((d) => {
              const m = left(d);
              const s = site.get(d.site_id);
              return (
                <tr key={d.id} className={needsAttention(d) ? "bg-[#fdf0ee]" : ""}>
                  <td className="cell" data-label="Food"><b className="font-semibold">{batch.get(d.batch_id)?.food}</b></td>
                  <td className="cell" data-label="To">{s?.name}{s?.contact_phone && <div className="text-xs text-muted">{s.contact_phone}</div>}</td>
                  <td className="cell font-mono md:text-right" data-label="Portions">{d.qty}</td>
                  <td className="cell" data-label="Volunteer">
                    <select id={`vol-${d.id}`} className="input py-1.5" value={d.volunteer_id ?? ""} disabled={pending || d.status === "delivered"}
                      onChange={(e) => run(() => assignVolunteer(d.id, e.target.value || null))}>
                      <option value="">Choose…</option>
                      {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}{v.vehicle !== "none" ? ` (${v.vehicle})` : ""}</option>)}
                    </select>
                  </td>
                  <td className="cell" data-label="Status"><StatusPill status={d.status} /><div className="font-mono text-xs text-muted">{fmtTime(d.updated_at)}</div></td>
                  <td className="cell font-mono" data-label="Safe until">
                    {fmtTime(d.safe_until)}{" "}
                    {d.status === "delivered"
                      ? <span className={new Date(d.delivered_at!) <= new Date(d.safe_until) ? "text-ok" : "text-crit"}>{new Date(d.delivered_at!) <= new Date(d.safe_until) ? "on time" : "late"}</span>
                      : <span className={m < ATTENTION_MIN ? "text-crit" : m < 45 ? "text-warn" : "text-muted"}>{m > 0 ? `${fmtDur(m)} left` : `late ${fmtDur(-m)}`}</span>}
                  </td>
                  <td className="cell" data-label="Send / update">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {d.status !== "delivered" && d.volunteer_id && <a className="link text-blue" href={whatsapp(d)} target="_blank" rel="noreferrer">WhatsApp</a>}
                      {d.status !== "delivered" && <button className="link" onClick={() => copy(d)}>{copied === d.id ? "Copied" : "Copy link"}</button>}
                      {NEXT_STATUS[d.status].map((to: DeliveryStatus) => (
                        <button key={to} className="link" disabled={pending} title="Update on the volunteer’s behalf" onClick={() => run(() => setStatusAsStaff(d.id, d.status, to))}>→ {STATUS[to].label}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className="grid gap-7 md:grid-cols-2">
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Latest updates</h2>
          {updates.length === 0 ? <p className="text-sm text-muted">No updates yet.</p> : (
            <ul className="flex max-h-72 flex-col gap-1.5 overflow-auto text-[13px] text-muted">
              {updates.map((u) => {
                const d = deliveries.find((x) => x.id === u.delivery_id);
                const v = d?.volunteer_id ? vol.get(d.volunteer_id)?.name : null;
                return (
                  <li key={u.id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                    <time className="font-mono text-xs">{fmtTime(u.created_at)}</time>
                    <span>{v ?? "Volunteer"}: {STATUS[u.status as DeliveryStatus]?.label ?? u.status} · {d ? `${d.qty} to ${site.get(d.site_id)?.name}` : ""}{u.note ? ` (${u.note})` : ""}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <AddVolunteer onAdd={(v) => run(() => addVolunteer(v))} pending={pending} />
      </div>
    </>
  );
}

function AddVolunteer({ onAdd, pending }: { onAdd: (v: { name: string; phone: string | null; vehicle: "none" | "car" | "bike" }) => void; pending: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState<"none" | "car" | "bike">("none");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">Add a volunteer</h2>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); onAdd({ name, phone: phone || null, vehicle }); setName(""); setPhone(""); }}>
        <input id="nv-name" className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input id="nv-phone" className="input" type="tel" placeholder="Phone (WhatsApp)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <select id="nv-vehicle" className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value as typeof vehicle)}>
          <option value="none">No vehicle</option><option value="car">Car</option><option value="bike">Bike</option>
        </select>
        <button className="btn-line sm:col-span-3 sm:justify-self-start" disabled={pending || !name.trim()}>Add volunteer</button>
      </form>
    </section>
  );
}

function Stat({ k, v, s, tone = "" }: { k: string; v: string; s: string; tone?: string }) {
  return (
    <div className="border-t border-line pt-3.5">
      <p className="stat-k">{k}</p>
      <p className={`stat-v ${tone}`}>{v}</p>
      <p className="stat-s">{s}</p>
    </div>
  );
}
