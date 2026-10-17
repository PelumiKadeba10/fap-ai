"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox } from "lucide-react";
import { Spinner } from "@/components/spinner";
import type { Batch, Category } from "@/lib/types";
import { CATEGORIES } from "@/lib/urgency";
import { fmtTime, toLagosInput } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { confirmBatch, discardBatch } from "../actions";
import { Badge, EmptyState, Pill, SectionCard } from "../ui";
import { useToast } from "../toast";
import { useAction } from "../use-action";
import { PhotoThumb } from "../photo-viewer";

/** Food reported through collection links, waiting for a coordinator to check it. Updates live. */
export function NeedsChecking({ eventId, batches, pointNames, photos }: { eventId: string; batches: Batch[]; pointNames: Record<string, string>; photos: Record<string, string> }) {
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
    <SectionCard id="needs-checking" title="Needs checking" icon={Inbox} accent="orange" badge={newest.length > 0 ? <Pill tone="orange">{newest.length} waiting</Pill> : undefined}>
      {newest.length === 0 ? (
        <EmptyState icon={Inbox}>Nothing waiting. Food reported through collection links shows up here.</EmptyState>
      ) : (
        <ul className="flex flex-col">
          {newest.map((b) => <PendingItem key={b.id} batch={b} photo={photos[b.id]} point={b.collection_point_id ? pointNames[b.collection_point_id] : undefined} />)}
        </ul>
      )}
    </SectionCard>
  );
}

function PendingItem({ batch: b, point, photo }: { batch: Batch; point?: string; photo?: string }) {
  const toast = useToast();
  const startTime = toLagosInput(b.collected_at).slice(11);
  const [d, setD] = useState({ food: b.food, qty: b.qty, category: b.category as Category, time: startTime, location: b.location, condition: b.condition ?? "", notes: b.notes ?? "" });
  const { pending, busy, run } = useAction();
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => setD((p) => ({ ...p, [k]: v }));
  const unclear = b.notes === "Needs a quantity";

  const confirm = () => run(
    "confirm",
    () => confirmBatch(b.id, { food: d.food, qty: d.qty, category: d.category, collected_time: d.time !== startTime && d.time ? d.time : null, location: d.location, condition: d.condition, notes: d.notes }),
    () => toast(true, `Confirmed: ${d.qty} portions of ${d.food}`),
  );
  const discard = () => run("discard", () => discardBatch(b.id), () => toast(true, "Submission discarded"));

  return (
    <li className="flex flex-col gap-3.5 border-t border-line py-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
        <b className="text-sm font-semibold text-ink">{point ?? "Collection point"}</b>
        <span className="font-mono">{fmtTime(b.created_at)}</span>
        {b.parsed_by && <Badge>{b.parsed_by === "claude" ? "Read by Claude" : "Offline parser"}</Badge>}
        {unclear && <Pill tone="orange">Needs a quantity</Pill>}
      </div>
      {(b.raw_message || photo) && (
        <div className="flex items-start gap-3">
          {photo && <PhotoThumb src={photo} label={`${b.food}, ${point ?? "collection point"}`} />}
          {b.raw_message && <blockquote className="min-w-0 flex-1 rounded-lg bg-soft px-3 py-2.5 text-sm break-words">{b.raw_message}</blockquote>}
        </div>
      )}
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
        <button className="btn-dark" onClick={confirm} disabled={pending || !d.food.trim() || d.qty < 1} aria-busy={busy("confirm")}>
          {busy("confirm") ? <Spinner /> : <Check className="size-4" aria-hidden />}
          {busy("confirm") ? "Confirming…" : "Confirm"}
        </button>
        <button className="link-danger inline-flex items-center gap-1.5" onClick={discard} disabled={pending} aria-busy={busy("discard")} aria-label={`Discard submission: ${b.food}`}>
          {busy("discard") && <Spinner className="size-3.5" />}{busy("discard") ? "Discarding…" : "Discard"}
        </button>
      </div>
    </li>
  );
}

