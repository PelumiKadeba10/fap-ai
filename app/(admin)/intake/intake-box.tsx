"use client";
import { useState, useTransition } from "react";
import type { Category, ParsedRecord } from "@/lib/types";
import { CATEGORIES, urgency } from "@/lib/urgency";
import { fmtTime, lagosTimeToday } from "@/lib/format";
import { addBatch } from "../actions";
import { UrgencyPill } from "../ui";

const EXAMPLES = [
  "350 jollof rice and chicken, packed 8:15pm at Convocation Centre, still hot",
  "about 80 plates of moi moi and fried plantain at the cafeteria, collected 8:50pm, warm",
  "6 crates of bottled water + 40 packs of biscuits by the chapel, sealed",
];

export function IntakeBox() {
  const [message, setMessage] = useState("");
  const [rec, setRec] = useState<ParsedRecord | null>(null);
  const [parsedBy, setParsedBy] = useState<"claude" | "local" | "manual">("manual");
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, startSave] = useTransition();

  async function parse() {
    setParsing(true);
    setError("");
    try {
      const res = await fetch("/api/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn’t read that message.");
      setRec(data.record);
      setParsedBy(data.parsedBy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t read that message.");
    } finally {
      setParsing(false);
    }
  }

  function save() {
    if (!rec) return;
    startSave(async () => {
      const r = await addBatch({
        food: rec.food, qty: rec.quantity, category: rec.category, collected_time: rec.collected_time,
        location: rec.location, condition: rec.condition, notes: rec.notes,
        raw_message: message || null, parsed_by: parsedBy,
      });
      if (!r.ok) return setError(r.error);
      setRec(null);
      setMessage("");
    });
  }

  const edit = <K extends keyof ParsedRecord>(k: K, v: ParsedRecord[K]) => setRec((p) => (p ? { ...p, [k]: v } : p));
  const collected = rec?.collected_time ? lagosTimeToday(rec.collected_time) : new Date();
  const u = rec ? urgency({ category: rec.category, qty: rec.quantity, collected_at: collected ?? new Date() }) : null;

  return (
    <div className="grid gap-7 md:grid-cols-2">
      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Volunteer message</h2>
        <label className="label">Message
          <textarea id="msg" className="input min-h-24" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. 200 packs of fried rice at the cafeteria, 9pm, hot" />
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((x) => (
            <button key={x} type="button" className="rounded-full border border-[#dde2e7] px-3 py-1 text-left text-[13px] hover:border-[#b9c1c9]" onClick={() => setMessage(x)}>
              {x.length > 46 ? x.slice(0, 46) + "…" : x}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-dark" onClick={parse} disabled={parsing || !message.trim()}>{parsing ? "Reading message…" : "Parse message"}</button>
          <button className="link" type="button" onClick={() => { setRec({ food: "", quantity: 0, collected_time: null, location: "Convocation Centre", condition: "", category: "cooked_meal", notes: "" }); setParsedBy("manual"); }}>
            Enter manually
          </button>
        </div>
        {error && <p className="text-sm text-crit">{error}</p>}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Record <span className="text-sm font-normal text-muted">{rec ? (parsedBy === "claude" ? "· read by Claude, check before saving" : parsedBy === "local" ? "· read by the offline parser, check before saving" : "· manual entry") : ""}</span></h2>
        {!rec ? (
          <div className="empty">Parse a message to see the record and its urgency score.</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label sm:col-span-2">Food<input id="r-food" className="input" value={rec.food} onChange={(e) => edit("food", e.target.value)} /></label>
              <label className="label">Portions<input id="r-qty" className="input font-mono" type="number" min={1} value={rec.quantity || ""} onChange={(e) => edit("quantity", Number(e.target.value))} /></label>
              <label className="label">Collected at<input id="r-time" className="input" type="time" value={rec.collected_time ?? ""} onChange={(e) => edit("collected_time", e.target.value || null)} /></label>
              <label className="label">Type
                <select id="r-cat" className="input" value={rec.category} onChange={(e) => edit("category", e.target.value as Category)}>
                  {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </select>
              </label>
              <label className="label">Condition<input id="r-cond" className="input" value={rec.condition} onChange={(e) => edit("condition", e.target.value)} /></label>
              <label className="label sm:col-span-2">Location<input id="r-loc" className="input" value={rec.location} onChange={(e) => edit("location", e.target.value)} /></label>
            </div>
            {u && (
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <UrgencyPill level={u.level} score={u.score} />
                <span className="text-muted">{u.minutesLeft > 0 ? `Safe until ${fmtTime(u.safeUntil)}` : "Past its safe time"}</span>
              </div>
            )}
            <button className="btn-dark self-start" onClick={save} disabled={saving || !rec.food || rec.quantity < 1}>{saving ? "Saving…" : "Save batch"}</button>
          </>
        )}
      </section>
    </div>
  );
}
