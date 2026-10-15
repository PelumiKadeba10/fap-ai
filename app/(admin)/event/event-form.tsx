"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventRow, EventType } from "@/lib/types";
import { EVENT_TYPES, MEALS_PER_PERSON, predict } from "@/lib/predict";
import { fmtTime, fromLagosInput, n0, toLagosInput } from "@/lib/format";
import { saveEvent } from "../actions";
import { Stat } from "../ui";
import { useToast } from "../toast";
import { Check, ChevronRight, Loader2 } from "lucide-react";

/** `copyFrom` is the last event, offered as a setup to copy (places, collection points, buses) when creating a new one. */
export function EventForm({ event, copyFrom }: { event: EventRow | null; copyFrom?: { id: string; name: string } | null }) {
  const [copy, setCopy] = useState(true);
  const [f, setF] = useState({
    name: event?.name ?? "",
    type: (event?.type ?? "convocation") as EventType,
    students: event?.students ?? 8000,
    starts: toLagosInput(event?.starts_at ?? "2026-10-30T13:00:00Z"),
    duration_hours: event?.duration_hours ?? 6,
    guests_per_student: event?.guests_per_student ?? 0,
    meals_served: event?.meals_served ?? null,
    vendors: event?.vendors ?? 5,
  });
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF((p) => ({ ...p, [k]: k === "name" || k === "type" || k === "starts" ? v : k === "meals_served" ? (v === "" ? null : Number(v)) : Number(v) }));
  };

  const p = useMemo(() => predict({ ...f, starts_at: fromLagosInput(f.starts) }), [f]);

  function onSave() {
    start(async () => {
      const r = await saveEvent({ id: event?.id, ...f, starts_at: fromLagosInput(f.starts), copy_from: !event && copy && copyFrom ? copyFrom.id : undefined });
      toast(r.ok, r.ok ? (event ? "Event saved" : "Event created") : r.error);
      if (r.ok && !event) { router.replace("/setup"); router.refresh(); }
    });
  }

  const steps = [
    { t: p.volunteersBy, k: "Volunteers in place", s: "30 minutes before" },
    { t: p.surplusFrom, k: "Surplus available", s: "when the event ends" },
    { t: p.cookedDeliverBy, k: "Cooked food delivered by", s: "2-hour safe window" },
  ];

  return (
    <div className="grid gap-x-12 gap-y-9 md:grid-cols-2">
      <section className="flex flex-col gap-5">
        <h2 className="h2">Event details</h2>
        <label className="label">Name<input id="ev-name" className="input" value={f.name} placeholder="e.g. Convocation 2026" onChange={set("name")} /></label>
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
        <details className="group border-t border-line pt-4" open={!!(f.guests_per_student || f.meals_served || f.vendors !== 5)}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
            If you know more <span className="font-normal text-muted">(optional)</span>
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="label">Guests per student<input id="ev-guests" className="input font-mono" type="number" min={0} max={10} step={0.5} value={f.guests_per_student} onChange={set("guests_per_student")} /></label>
            <label className="label">Meals to be served<input id="ev-meals" className="input font-mono" type="number" min={0} step={100} value={f.meals_served ?? ""} placeholder="Leave blank to estimate" onChange={set("meals_served")} /></label>
            <label className="label">Vendors / caterers<input id="ev-vendors" className="input font-mono" type="number" min={1} max={40} value={f.vendors} onChange={set("vendors")} /></label>
          </div>
        </details>
      </section>

      <section className="flex flex-col gap-7 md:row-span-2" aria-label="Prediction">
        <div>
          <p className="stat-k">Predicted surplus</p>
          <p className="mt-1.5 text-5xl leading-none font-semibold tracking-tight tabular-nums sm:text-6xl">{n0(p.surplus)} <span className="text-2xl font-medium text-muted sm:text-3xl">meals</span></p>
          <p className="mt-2 text-sm text-muted">Likely range <span className="font-mono">{n0(p.low)}–{n0(p.high)}</span></p>
          <p className="mt-3 text-sm text-muted">
            <span className="font-mono">{n0(p.people)}</span> people · <span className="font-mono">{n0(p.meals)}</span> meals served {p.mealsKnown ? "(entered)" : `(estimated at ${MEALS_PER_PERSON} per person)`} · about {Math.round(p.rate * 100)}% of meals at a {EVENT_TYPES[f.type].label.toLowerCase()} go uneaten
          </p>
        </div>

        <div>
          <h3 className="mb-3 text-[13px] font-medium text-muted">Timing</h3>
          <ol className="grid grid-cols-3">
            {steps.map((x, i) => (
              <li key={x.k} className="relative pt-5 pr-2">
                <span className="absolute top-0 left-0 size-2.5 rounded-full bg-ink ring-4 ring-white" aria-hidden />
                {i < steps.length - 1 && <span className="absolute top-[4px] left-2.5 h-px w-[calc(100%-10px)] bg-[#cfd5db]" aria-hidden />}
                <p className="font-mono text-base font-medium tabular-nums">{fmtTime(x.t)}</p>
                <p className="mt-0.5 text-[13px] leading-snug font-medium">{x.k}</p>
                <p className="text-xs leading-snug text-muted">{x.s}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <Stat label="Volunteers needed" value={String(p.volunteers)} hint="1 per 90 portions" />
          <Stat label="Insulated carriers" value={String(p.carriers)} hint="50 packs each" />
          <Stat label="Vehicle trips" value={String(p.trips)} hint="400 packs per trip" />
          <Stat label="Collection points" value={String(p.collectionPoints)} hint="one per vendor" />
        </div>
      </section>

      <div className="flex flex-col gap-3 max-md:sticky max-md:bottom-0 max-md:z-10 max-md:-mx-4 max-md:border-t max-md:border-line max-md:bg-white/95 max-md:px-4 max-md:py-3 max-md:backdrop-blur">
        {!event && copyFrom && (
          <label className="flex min-h-10 cursor-pointer items-start gap-2.5 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#111418]" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
            <span>Copy setup from last event <span className="text-muted">({copyFrom.name}): its places, collection points and buses. Food and trips are not copied.</span></span>
          </label>
        )}
        <button className="btn-dark max-md:w-full" onClick={onSave} disabled={pending || !f.name.trim()} aria-busy={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {pending ? "Saving…" : event ? "Save changes" : "Create event"}
        </button>
      </div>
    </div>
  );
}
