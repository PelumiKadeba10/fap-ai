"use client";
import { useMemo, useState, useTransition } from "react";
import type { EventRow, EventType } from "@/lib/types";
import { EVENT_TYPES, MEALS_PER_PERSON, predict } from "@/lib/predict";
import { fmtTime, fromLagosInput, n0, toLagosInput } from "@/lib/format";
import { saveEvent } from "../actions";

export function EventForm({ event }: { event: EventRow | null }) {
  const [f, setF] = useState({
    name: event?.name ?? "Convocation 2026",
    type: (event?.type ?? "convocation") as EventType,
    students: event?.students ?? 8000,
    starts: toLagosInput(event?.starts_at ?? "2026-10-30T13:00:00Z"),
    duration_hours: event?.duration_hours ?? 6,
    guests_per_student: event?.guests_per_student ?? 0,
    meals_served: event?.meals_served ?? null,
    vendors: event?.vendors ?? 5,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF((p) => ({ ...p, [k]: k === "name" || k === "type" || k === "starts" ? v : k === "meals_served" ? (v === "" ? null : Number(v)) : Number(v) }));
    setMsg(null);
  };

  const p = useMemo(() => predict({ ...f, starts_at: fromLagosInput(f.starts) }), [f]);

  function onSave() {
    start(async () => {
      const r = await saveEvent({ id: event?.id, ...f, starts_at: fromLagosInput(f.starts) });
      setMsg(r.ok ? { ok: true, text: "Event saved" } : { ok: false, text: r.error });
    });
  }

  return (
    <div className="grid gap-7 md:grid-cols-2">
      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Event</h2>
        <label className="label">Name<input id="ev-name" className="input" value={f.name} onChange={set("name")} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="label">Event type
            <select id="ev-type" className="input" value={f.type} onChange={set("type")}>
              {Object.entries(EVENT_TYPES).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          </label>
          <label className="label">Number of students<input id="ev-students" className="input font-mono" type="number" min={0} step={100} value={f.students} onChange={set("students")} /></label>
          <label className="label">Start (date and time)<input id="ev-start" className="input" type="datetime-local" value={f.starts} onChange={set("starts")} /></label>
          <label className="label">Duration (hours)<input id="ev-duration" className="input font-mono" type="number" min={1} max={24} step={0.5} value={f.duration_hours} onChange={set("duration_hours")} /></label>
        </div>
        <details className="border-t border-line pt-3.5" open={!!(f.guests_per_student || f.meals_served || f.vendors !== 5)}>
          <summary className="cursor-pointer text-sm font-medium">If you know more <span className="text-muted">(optional)</span></summary>
          <div className="mt-3.5 grid gap-4 sm:grid-cols-2">
            <label className="label">Guests per student<input id="ev-guests" className="input font-mono" type="number" min={0} max={10} step={0.5} value={f.guests_per_student} onChange={set("guests_per_student")} /></label>
            <label className="label">Meals to be served<input id="ev-meals" className="input font-mono" type="number" min={0} step={100} value={f.meals_served ?? ""} placeholder="Leave blank to estimate" onChange={set("meals_served")} /></label>
            <label className="label">Vendors / caterers<input id="ev-vendors" className="input font-mono" type="number" min={1} max={40} value={f.vendors} onChange={set("vendors")} /></label>
          </div>
        </details>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-dark" onClick={onSave} disabled={pending}>{pending ? "Saving…" : event ? "Save changes" : "Create event"}</button>
          {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-crit"}`}>{msg.text}</span>}
        </div>
      </section>

      <section className="grid content-start gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <p className="stat-k">Predicted surplus</p>
          <p className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{n0(p.surplus)} meals</p>
          <p className="stat-s">Likely range {n0(p.low)}–{n0(p.high)}</p>
          <p className="mt-2 text-sm text-muted">
            {n0(p.people)} people · {n0(p.meals)} meals served {p.mealsKnown ? "(entered)" : `(estimated at ${MEALS_PER_PERSON} per person)`} · about {Math.round(p.rate * 100)}% of meals at a {EVENT_TYPES[f.type].label.toLowerCase()} go uneaten
          </p>
        </div>
        <Stat k="Surplus available from" v={fmtTime(p.surplusFrom)} s="when the event ends" />
        <Stat k="Volunteers in place by" v={fmtTime(p.volunteersBy)} s="30 minutes before" />
        <p className="text-sm text-muted sm:col-span-2">
          Cooked food collected at {fmtTime(p.surplusFrom)} must be delivered by about <b className="text-ink">{fmtTime(p.cookedDeliverBy)}</b> (2-hour safe window).
        </p>
        <Stat k="Volunteers needed" v={String(p.volunteers)} s="1 per 90 portions" />
        <Stat k="Insulated carriers" v={String(p.carriers)} s="50 packs each" />
        <Stat k="Vehicle trips" v={String(p.trips)} s="400 packs per trip" />
        <Stat k="Collection points" v={String(p.collectionPoints)} s="one per vendor" />
      </section>
    </div>
  );
}

function Stat({ k, v, s }: { k: string; v: string; s: string }) {
  return (
    <div className="border-t border-line pt-3.5">
      <p className="stat-k">{k}</p>
      <p className="stat-v">{v}</p>
      <p className="stat-s">{s}</p>
    </div>
  );
}
