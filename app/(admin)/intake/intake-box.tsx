"use client";
import { useState, useTransition } from "react";
import type { Category, CollectionPoint, ParsedRecord } from "@/lib/types";
import { CATEGORIES, urgency } from "@/lib/urgency";
import { fmtDur, fmtTime, lagosTimeToday } from "@/lib/format";
import { addBatch } from "../actions";
import { Badge, EmptyState, UrgencyPill } from "../ui";
import { useToast } from "../toast";
import { Bot, FileText, Loader2, MessageSquareText, PenLine, Save, Sparkles } from "lucide-react";

const EXAMPLES = [
  "350 jollof rice and chicken, packed 8:15pm at Convocation Centre, still hot",
  "about 80 plates of moi moi and fried plantain at the cafeteria, collected 8:50pm, warm",
  "6 crates of bottled water + 40 packs of biscuits by the chapel, sealed",
];

const BY = {
  claude: { icon: Sparkles, text: "Read by Claude" },
  local: { icon: Bot, text: "Offline parser" },
  manual: { icon: PenLine, text: "Manual entry" },
} as const;

/** `hubs` are the active collection points. When there are any, pasted food must say which hub it is in. */
export function IntakeBox({ hubs }: { hubs: Pick<CollectionPoint, "id" | "name">[] }) {
  const [message, setMessage] = useState("");
  const [rec, setRec] = useState<ParsedRecord | null>(null);
  const [parsedBy, setParsedBy] = useState<"claude" | "local" | "manual">("manual");
  const [error, setError] = useState("");
  const [hubId, setHubId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, startSave] = useTransition();
  const toast = useToast();

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
        raw_message: message || null, parsed_by: parsedBy, collection_point_id: hubId || null,
      });
      if (!r.ok) return toast(false, r.error);
      toast(true, `Batch saved: ${rec.quantity} portions of ${rec.food}`);
      setRec(null);
      setMessage("");
      setHubId("");
    });
  }

  const edit = <K extends keyof ParsedRecord>(k: K, v: ParsedRecord[K]) => setRec((p) => (p ? { ...p, [k]: v } : p));
  const collected = rec?.collected_time ? lagosTimeToday(rec.collected_time) : new Date();
  const u = rec ? urgency({ category: rec.category, qty: rec.quantity, collected_at: collected ?? new Date() }) : null;
  const by = BY[parsedBy];

  return (
    <div className="grid gap-x-12 gap-y-9 md:grid-cols-2">
      <section className="flex flex-col gap-4">
        <h2 className="h2">Volunteer message</h2>
        <label className="label">Message
          <textarea id="msg" className="input min-h-28" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="e.g. 200 packs of fried rice at the cafeteria, 9pm, hot" />
        </label>
        <div>
          <p className="mb-2 text-[13px] text-muted">Try an example</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" className="chip text-left" onClick={() => setMessage(x)}>
                {x.length > 46 ? x.slice(0, 46) + "…" : x}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button className="btn-dark" onClick={parse} disabled={parsing || !message.trim()}>
            {parsing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MessageSquareText className="size-4" aria-hidden />}
            {parsing ? "Reading message…" : "Parse message"}
          </button>
          <button className="link" type="button" onClick={() => { setRec({ food: "", quantity: 0, collected_time: null, location: "Convocation Centre", condition: "", category: "cooked_meal", notes: "" }); setParsedBy("manual"); }}>
            Enter manually
          </button>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-crit">{error}</p>}
      </section>

      <section className="flex flex-col gap-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Record</h2>
          {rec && <Badge icon={by.icon}>{by.text}</Badge>}
        </div>
        {!rec ? (
          <EmptyState icon={FileText}>Parse a message to see the record and its urgency.</EmptyState>
        ) : (
          <>
            {parsedBy !== "manual" && <p className="-mt-2 text-[13px] text-muted">Check the details before saving.</p>}
            <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
              <label className="label sm:col-span-2">Food<input id="r-food" className="input" value={rec.food} onChange={(e) => edit("food", e.target.value)} /></label>
              <label className="label">Portions<input id="r-qty" className="input font-mono" type="number" min={1} value={rec.quantity || ""} onChange={(e) => edit("quantity", Number(e.target.value))} /></label>
              <label className="label">Collected at<input id="r-time" className="input font-mono" type="time" value={rec.collected_time ?? ""} onChange={(e) => edit("collected_time", e.target.value || null)} /></label>
              <label className="label">Type
                <select id="r-cat" className="input" value={rec.category} onChange={(e) => edit("category", e.target.value as Category)}>
                  {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
                </select>
              </label>
              <label className="label">Condition<input id="r-cond" className="input" value={rec.condition} onChange={(e) => edit("condition", e.target.value)} /></label>
              {hubs.length > 0 && (
                <label className="label sm:col-span-2">Hub (where the food is)
                  <select id="r-hub" className="input" value={hubId} onChange={(e) => setHubId(e.target.value)}>
                    <option value="">Choose a hub…</option>
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
            <button className="btn-dark self-start max-sm:w-full" onClick={save} disabled={saving || !rec.food || rec.quantity < 1 || (hubs.length > 0 && !hubId)}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {saving ? "Saving…" : "Save batch"}
            </button>
          </>
        )}
      </section>
    </div>
  );
}
