"use client";
import { useState, useTransition } from "react";
import type { Category, CollectionPoint, ParsedRecord } from "@/lib/types";
import { CATEGORIES, urgency } from "@/lib/urgency";
import { fmtDur, fmtTime, lagosTimeToday } from "@/lib/format";
import { addBatch } from "../actions";
import { UrgencyPill } from "../ui";
import { useToast } from "../toast";
import { Loader2, Save, X } from "lucide-react";

const BLANK: ParsedRecord = { food: "", quantity: 0, collected_time: null, location: "Convocation Centre", condition: "", category: "cooked_meal", notes: "" };

/** `hubs` are the active collection points. When there are any, the food must say which hub it is in. */
export function IntakeBox({ hubs }: { hubs: Pick<CollectionPoint, "id" | "name">[] }) {
  const [rec, setRec] = useState<ParsedRecord>(BLANK);
  const [hubId, setHubId] = useState("");
  const [saving, startSave] = useTransition();
  const toast = useToast();

  function cancel() {
    setRec(BLANK);
    setHubId("");
  }

  function save() {
    startSave(async () => {
      const r = await addBatch({
        food: rec.food, qty: rec.quantity, category: rec.category, collected_time: rec.collected_time,
        location: rec.location, condition: rec.condition, notes: rec.notes,
        raw_message: null, parsed_by: "manual", collection_point_id: hubId || null,
      });
      if (!r.ok) return toast(false, r.error);
      toast(true, `Batch saved: ${rec.quantity} boxes/cartons of ${rec.food}`);
      cancel();
    });
  }

  const edit = <K extends keyof ParsedRecord>(k: K, v: ParsedRecord[K]) => setRec((p) => ({ ...p, [k]: v }));
  const collected = rec.collected_time ? lagosTimeToday(rec.collected_time) : new Date();
  const u = rec.quantity > 0 ? urgency({ category: rec.category, qty: rec.quantity, collected_at: collected ?? new Date() }) : null;

  return (
    <div className="flex max-w-xl flex-col gap-4">
      <h2 className="h2">Record</h2>
      <>
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
              <label className="label sm:col-span-2">Food<input id="r-food" className="input" value={rec.food} onChange={(e) => edit("food", e.target.value)} /></label>
              <label className="label">Number of boxes / cartons<input id="r-qty" className="input font-mono" type="number" min={1} value={rec.quantity || ""} onChange={(e) => edit("quantity", Number(e.target.value))} /></label>
              <label className="label">Collected at<input id="r-time" className="input font-mono" type="time" value={rec.collected_time ?? ""} onChange={(e) => edit("collected_time", e.target.value || null)} /></label>
              <label className="label">Type
                <select id="r-cat" className="input" value={rec.category} onChange={(e) => edit("category", e.target.value as Category)}>
                  {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </select>
              </label>
              <label className="label">Condition<input id="r-cond" className="input" value={rec.condition} onChange={(e) => edit("condition", e.target.value)} /></label>
              {hubs.length > 0 && (
                <label className="label sm:col-span-2">Collection point (where the food is)
                  <select id="r-hub" className="input" value={hubId} onChange={(e) => setHubId(e.target.value)}>
                    <option value="">Choose a collection point…</option>
                    {hubs.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
                  </select>
                </label>
              )}
              <label className="label sm:col-span-2">Location<input id="r-loc" className="input" value={rec.location} onChange={(e) => edit("location", e.target.value)} /></label>
            </div>
            {u && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-4 text-sm">
                <UrgencyPill level={u.level} score={u.score} />
                <span className="text-muted">
                  {u.minutesLeft > 0
                    ? `${CATEGORIES[rec.category].label}: deliver within ${fmtDur(u.minutesLeft)} (safe until ${fmtTime(u.safeUntil)})`
                    : "Past its safe time. Check before sending."}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-dark max-sm:flex-1" onClick={save} aria-busy={saving} disabled={saving || !rec.food || rec.quantity < 1 || (hubs.length > 0 && !hubId)}>
                {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                {saving ? "Saving…" : "Save batch"}
              </button>
              <button type="button" className="btn-line max-sm:flex-1" onClick={cancel} disabled={saving}>
                <X className="size-4" aria-hidden /> Cancel
              </button>
            </div>
      </>
    </div>
  );
}
