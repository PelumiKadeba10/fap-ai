"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, Filter, MessageCircle, UserPlus } from "lucide-react";
import type { Batch, Delivery, DeliveryStatus, Site, Volunteer } from "@/lib/types";
import { ATTENTION_MIN, NEXT_STATUS, STATUS } from "@/lib/status";
import { fmtDur, fmtTime, minutesBetween, n0 } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { addVolunteer, assignVolunteer, setStatusAsStaff } from "../actions";
import { EmptyState, Pill, SectionHead, Stat, StatusPill, cardTable } from "../ui";
import { useToast } from "../toast";

type Update = { id: number; delivery_id: string; status: string; note: string | null; created_at: string };
type FilterKey = "all" | "attention" | "waiting" | "moving" | "delivered";

const ACT = "btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11";

export function LiveBoard({ eventId, deliveries, batches, sites, volunteers, updates, siteUrl }: {
  eventId: string; deliveries: Delivery[]; batches: Batch[]; sites: Site[]; volunteers: Volunteer[]; updates: Update[]; siteUrl: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [now, setNow] = useState(() => new Date());
  const [copied, setCopied] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
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

  const FILTERS: { key: FilterKey; label: string; n: number; test: (d: Delivery) => boolean }[] = [
    { key: "all", label: "All", n: deliveries.length, test: () => true },
    { key: "attention", label: "Needs attention", n: counts.attention, test: needsAttention },
    { key: "waiting", label: "Waiting", n: counts.waiting, test: (d) => d.status === "assigned" },
    { key: "moving", label: "On the way", n: counts.moving, test: (d) => d.status === "picked_up" || d.status === "on_the_way" },
    { key: "delivered", label: "Delivered", n: delivered.length, test: (d) => d.status === "delivered" },
  ];
  const shown = deliveries.filter(FILTERS.find((f) => f.key === filter)!.test);

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
    try { await navigator.clipboard.writeText(link(d)); setCopied(d.id); setTimeout(() => setCopied(""), 1500); toast(true, "Link copied"); } catch { toast(false, "Couldn’t copy. Long-press the link instead."); }
  }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) toast(false, r.error ?? "Something went wrong."); });

  return (
    <>
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 md:grid-cols-4">
        <Stat label="Delivered" value={n0(counts.delivered)} hint={`of ${n0(counts.total)} portions`} />
        <Stat label="On the way" value={String(counts.moving)} hint="deliveries" />
        <Stat label="Waiting" value={String(counts.waiting)} hint={counts.unassigned ? `${counts.unassigned} without a volunteer` : "waiting for pickup"} />
        <Stat label="Needs attention" value={String(counts.attention)} tone={counts.attention ? "red" : "green"} hint={counts.attention ? "delayed or near safe time" : "all on track"} />
      </div>

      <section className="flex flex-col gap-4">
        <SectionHead title="Deliveries" aside={<>Updated {fmtTime(now)} · refreshes live</>} />
        <div role="group" aria-label="Filter deliveries" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none]">
          {FILTERS.map((f) => {
            const on = filter === f.key;
            const alarm = f.key === "attention" && f.n > 0;
            return (
              <button key={f.key} type="button" aria-pressed={on} onClick={() => setFilter(f.key)}
                className={`chip flex-none max-md:min-h-11 ${on ? "!border-ink !bg-ink !text-white" : alarm ? "!text-crit" : ""}`}>
                {f.key === "attention" && <AlertTriangle className="size-3.5" aria-hidden />}
                {f.label} <span className="font-mono text-xs opacity-80">{f.n}</span>
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={Filter} action={<button className="underline underline-offset-4" onClick={() => setFilter("all")}>Show all deliveries</button>}>
            {filter === "attention" ? "Nothing needs attention right now." : "No deliveries match this filter."}
          </EmptyState>
        ) : (
          <table className={cardTable}>
            <thead><tr><th className="th md:pl-3">Food</th><th className="th">Deliver to</th><th className="th">Volunteer</th><th className="th">Status</th><th className="th">Safe until</th><th className="th">Actions</th></tr></thead>
            <tbody>
              {shown.map((d) => {
                const m = left(d);
                const s = site.get(d.site_id);
                const attn = needsAttention(d);
                const reason = d.status === "delayed" ? "Delayed" : m > 0 ? `${fmtDur(m)} left` : `Late ${fmtDur(-m)}`;
                const onTime = d.delivered_at ? new Date(d.delivered_at) <= new Date(d.safe_until) : true;
                const cd = m < ATTENTION_MIN ? "text-crit" : m < 45 ? "text-warn" : "text-muted";
                return (
                  <tr key={d.id} className={attn ? "bg-[#fdf6f5] max-md:border-l-4 max-md:border-l-crit max-md:pl-3" : ""}>
                    <td className={`cell md:border-l-4 md:pl-2 max-md:col-span-2 ${attn ? "md:border-l-crit" : "md:border-l-transparent"}`} data-label="Food">
                      <b className="font-semibold">{batch.get(d.batch_id)?.food}</b>
                      <div className="font-mono text-[13px] text-muted">{d.qty} portions</div>
                    </td>
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
                      <div className="mt-1 font-mono text-xs text-muted">{fmtTime(d.updated_at)}</div>
                      {attn && <div className="mt-1"><Pill tone="red" icon={AlertTriangle}>{reason}</Pill></div>}
                    </td>
                    <td className="cell" data-label="Safe until">
                      <span className="font-mono">{fmtTime(d.safe_until)}</span>
                      <div className="text-[13px] font-medium">
                        {d.status === "delivered"
                          ? <span className={onTime ? "text-ok" : "text-crit"}>{onTime ? "Delivered on time" : "Delivered late"}</span>
                          : <span className={cd}>{m > 0 ? `${fmtDur(m)} left` : `Late ${fmtDur(-m)}`}</span>}
                      </div>
                    </td>
                    <td className="cell" data-label="Actions">
                      <div className="flex flex-wrap items-center gap-2">
                        {d.status !== "delivered" && d.volunteer_id && (
                          <a className={ACT} href={whatsapp(d)} target="_blank" rel="noreferrer"><MessageCircle className="size-4" aria-hidden />WhatsApp</a>
                        )}
                        {d.status !== "delivered" && (
                          <button className={ACT} onClick={() => copy(d)}>
                            {copied === d.id ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                            {copied === d.id ? "Copied" : "Copy link"}
                          </button>
                        )}
                        {NEXT_STATUS[d.status].map((to: DeliveryStatus) => (
                          <button key={to} className={`${ACT} ${to === "delivered" ? "!border-ink !bg-ink !text-white hover:!bg-[#2a3038]" : ""}`} disabled={pending} title="Update on the volunteer’s behalf" onClick={() => run(() => setStatusAsStaff(d.id, d.status, to))}>
                            → {STATUS[to].label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-x-12 gap-y-9 md:grid-cols-2">
        <section className="flex flex-col gap-4">
          <SectionHead title="Latest updates" />
          {updates.length === 0 ? <p className="text-sm text-muted">No updates yet.</p> : (
            <ol className="flex max-h-80 flex-col overflow-auto border-l border-line pl-4 text-sm">
              {updates.map((u) => {
                const d = deliveries.find((x) => x.id === u.delivery_id);
                const v = d?.volunteer_id ? vol.get(d.volunteer_id)?.name : null;
                return (
                  <li key={u.id} className="relative pb-3.5">
                    <span className="absolute top-[7px] -left-[20.5px] size-2 rounded-full bg-[#b3bac2] ring-4 ring-white" aria-hidden />
                    <time className="font-mono text-xs text-muted">{fmtTime(u.created_at)}</time>
                    <p><b className="font-medium">{v ?? "Volunteer"}</b> · {STATUS[u.status as DeliveryStatus]?.label ?? u.status}</p>
                    <p className="text-[13px] text-muted">{d ? `${d.qty} to ${site.get(d.site_id)?.name}` : ""}{u.note ? ` (${u.note})` : ""}</p>
                  </li>
                );
              })}
            </ol>
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
    <section className="flex flex-col gap-4">
      <SectionHead title="Add a volunteer" />
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
