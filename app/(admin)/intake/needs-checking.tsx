"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox, Loader2 } from "lucide-react";
import type { Batch, Category } from "@/lib/types";
import { CATEGORIES } from "@/lib/urgency";
import { fmtTime, toLagosInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { confirmBatch, discardBatch } from "../actions";
import { Badge, EmptyState, Pill } from "../ui";
import { useToast } from "../toast";

/** Food reported through collection links, waiting for a coordinator to check it. Updates live. */
export function NeedsChecking({ eventId, batches, pointNames }: { eventId: string; batches: Batch[]; pointNames: Record<string, string> }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`batches-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "batches", filter: `event_id=eq.${eventId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [eventId, router]);

  const newest = [...batches].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="needs-checking">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="needs-checking" className="h2">Needs checking</h2>
        {newest.length > 0 && <Pill tone="orange">{newest.length} waiting</Pill>}
      </div>
      {newest.length === 0 ? (
        <EmptyState icon={Inbox}>Nothing waiting. Food reported through collection links shows up here.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {newest.map((b) => <PendingItem key={b.id} batch={b} point={b.collection_point_id ? pointNames[b.collection_point_id] : undefined} />)}
        </ul>
      )}
    </section>
  );
}

function PendingItem({ batch: b, point }: { batch: Batch; point?: string }) {
  const toast = useToast();
  const startTime = toLagosInput(b.collected_at).slice(11);
  const [d, setD] = useState({ food: b.food, qty: b.qty, category: b.category as Category, time: startTime, location: b.location, condition: b.condition ?? "", notes: b.notes ?? "" });
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((p) => ({ ...p, [k]: v }));
  const unclear = b.notes === "Needs a quantity";

  const confirm = () => start(async () => {
    const r = await confirmBatch(b.id, { food: d.food, qty: d.qty, category: d.category, collected_time: d.time !== startTime && d.time ? d.time : null, location: d.location, condition: d.condition, notes: d.notes });
    toast(r.ok, r.ok ? `Confirmed: ${d.qty} portions of ${d.food}` : r.error);
  });
  const discard = () => start(async () => {
    const r = await discardBatch(b.id);
    toast(r.ok, r.ok ? "Submission discarded" : r.error);
  });

  return (
    <li className="flex flex-col gap-3.5 border-t border-line py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
        <b className="text-sm font-semibold text-ink">{point ?? "Collection point"}</b>
        <span className="font-mono">{fmtTime(b.created_at)}</span>
        {b.parsed_by && <Badge>{b.parsed_by === "claude" ? "Read by Claude" : "Offline parser"}</Badge>}
        {unclear && <Pill tone="orange">Needs a quantity</Pill>}
      </div>
      {b.raw_message && <blockquote className="rounded-lg bg-soft px-3 py-2.5 text-sm break-words">{b.raw_message}</blockquote>}
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="label sm:col-span-2">Food<input className="input" value={d.food} onChange={(e) => set("food", e.target.value)} /></label>
        <label className="label">Portions<input className="input font-mono" type="number" min={1} value={d.qty || ""} onChange={(e) => set("qty", Number(e.target.value))} /></label>
        <label className="label">Collected at<input className="input font-mono" type="time" value={d.time} onChange={(e) => set("time", e.target.value)} /></label>
        <label className="label">Type
          <select className="input" value={d.category} onChange={(e) => set("category", e.target.value as Category)}>
            {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
          </select>
        </label>
        <label className="label">Condition<input className="input" value={d.condition} onChange={(e) => set("condition", e.target.value)} /></label>
        <label className="label sm:col-span-2">Location<input className="input" value={d.location} onChange={(e) => set("location", e.target.value)} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button className="btn-dark" onClick={confirm} disabled={pending || !d.food.trim() || d.qty < 1}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          Confirm
        </button>
        <button className="link-danger" onClick={discard} disabled={pending} aria-label={`Discard submission: ${b.food}`}>Discard</button>
      </div>
    </li>
  );
}

