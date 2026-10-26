"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, MapPin, MessageSquare, Phone, Users } from "lucide-react";
import type { CollectionPoint } from "@/lib/types";
import { n0 } from "@/lib/format";
import { useToast } from "../toast";

export type PointStats = { waiting: number; reported: number; pickedUp: number; donated: number; unread: number };

const ACT = "btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11";

/** One card per active collection point: who leads it, what it has sent, and its links. */
export function PointCards({ points, stats, siteUrl }: { points: CollectionPoint[]; stats: Record<string, PointStats>; siteUrl: string }) {
  const toast = useToast();
  const [origin, setOrigin] = useState(siteUrl);
  const [copied, setCopied] = useState("");
  useEffect(() => { if (!siteUrl) setOrigin(window.location.origin); }, [siteUrl]);

  async function copy(key: string, url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(key); setTimeout(() => setCopied(""), 1500); toast(true, "Link copied"); } catch { toast(false, "Couldn’t copy. Long-press the link instead."); }
  }

  return (
    <ul aria-label="Collection points" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {points.map((p) => {
        const s = stats[p.id] ?? { waiting: 0, reported: 0, pickedUp: 0, donated: 0, unread: 0 };
        const batch = `${p.id}:batch`;
        const intake = `${p.id}:intake`;
        return (
          <li key={p.id} className="flex flex-col gap-3 rounded-xl border border-line p-4">
            <div className="min-w-0">
              <h3 className="break-words text-base font-semibold">{p.name}</h3>
              {p.location_note && <p className="mt-0.5 flex items-start gap-1.5 text-[13px] text-muted"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />{p.location_note}</p>}
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                {p.lead_name && <span>Lead: <b className="font-medium text-ink">{p.lead_name}</b></span>}
                {p.lead_phone && <a href={"tel:" + p.lead_phone} className="inline-flex items-center gap-1 font-mono hover:text-ink" aria-label={`Call ${p.lead_name ?? p.name}`}><Phone className="size-3.5" aria-hidden />{p.lead_phone}</a>}
                {p.volunteers != null && <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden /><span className="font-mono">{p.volunteers}</span> {p.volunteers === 1 ? "volunteer" : "volunteers"}</span>}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-[13px]">
              <Figure label="Packs waiting" value={s.waiting} strong />
              <Figure label="Reported" value={s.reported} />
              <Figure label="Picked up" value={s.pickedUp} />
              <Figure label="Donated" value={s.donated} />
            </dl>
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button type="button" className={ACT} onClick={() => copy(batch, `${origin}/r/${p.token}`)}>
                {copied === batch ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied === batch ? "Copied" : "Batch Submission link"}
              </button>
              <button type="button" className={ACT} onClick={() => copy(intake, `${origin}/i/${p.intake_token}`)}>
                {copied === intake ? <Check className="size-4 text-ok" aria-hidden /> : <Copy className="size-4" aria-hidden />}{copied === intake ? "Copied" : "Food Intake Link"}
              </button>
              <Link href={`/messages?t=intake:${p.id}`} className={ACT} aria-label={s.unread > 0 ? `Message ${p.name}, ${s.unread} unread` : `Message ${p.name}`}>
                <MessageSquare className="size-4" aria-hidden />Message
                {s.unread > 0 && <span className="rounded-full bg-crit px-1.5 py-px font-mono text-[11px] font-semibold text-white">{s.unread}</span>}
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Figure({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`rounded-lg px-2.5 py-1.5 ${strong ? "bg-ink text-white" : "bg-soft"}`}>
      <dt className={strong ? "text-white/70" : "text-muted"}>{label}</dt>
      <dd className="font-mono text-base font-semibold">{n0(value)}</dd>
    </div>
  );
}
