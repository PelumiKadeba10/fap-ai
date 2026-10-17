"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, HandHeart, Phone } from "lucide-react";
import type { Pledge } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { LATE_PICKUP_MIN, PLEDGE_STATUS, byPickupTime, isLate, pledgeCounts } from "@/lib/pledges";
import { createClient } from "@/lib/supabase/client";
import { Pill } from "../ui";

/** Pledged tents: how many are pledged, on the way, picked up or empty, and who is late. Updates live. */
export function PickupsCard({ eventId, pledges, pointNames }: { eventId: string; pledges: Pledge[]; pointNames: Record<string, string> }) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`pledges-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pledges", filter: `event_id=eq.${eventId}` }, () => router.refresh())
      .subscribe();
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => { clearInterval(t); supabase.removeChannel(ch); };
  }, [eventId, router]);

  if (!pledges.length) return null;
  const c = pledgeCounts(pledges);
  const late = pledges.filter((p) => isLate(p, now)).length;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="pickups-title">
      <div className="flex flex-wrap items-center gap-2.5">
        <h2 id="pickups-title" className="h2">Pick-ups</h2>
        {late > 0 && <Pill tone="red" icon={AlertTriangle}>{late} late</Pill>}
      </div>
      <p className="font-mono text-[13px] text-muted">{c.pledged} pledged · {c.on_the_way} on the way · {c.picked_up} picked up · {c.no_food} no food</p>
      <ul className="flex flex-col">
        {byPickupTime(pledges).map((p) => {
          const st = PLEDGE_STATUS[p.status];
          const isLateNow = isLate(p, now);
          return (
            <li key={p.id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line py-3 ${isLateNow ? "border-l-4 border-l-crit bg-[#fcecea] pl-3" : ""}`}>
              <div className="min-w-0">
                <p className="font-medium break-words">{p.tent_name}{p.pledged_packs != null && <span className="font-normal text-muted"> · <span className="font-mono">{p.pledged_packs}</span> packs</span>}</p>
                <p className="text-[13px] text-muted">
                  {p.pickup_from ? <>from <span className="font-mono">{fmtTime(p.pickup_from)}</span></> : "no time set"}
                  {p.collection_point_id && pointNames[p.collection_point_id] ? ` · ${pointNames[p.collection_point_id]}` : ""}
                  {p.status === "picked_up" && <> · <span className="font-mono">{p.picked_up_packs ?? "?"}</span> packs at <span className="font-mono">{fmtTime(p.picked_up_at)}</span></>}
                </p>
                {isLateNow && <p className="mt-0.5 text-[13px] font-semibold text-crit">Not picked up {LATE_PICKUP_MIN} minutes after its time</p>}
              </div>
              <div className="flex items-center gap-3">
                <Pill tone={st.tone}>{st.label}</Pill>
                {p.contact_phone && (
                  <a href={"tel:" + p.contact_phone} className="btn-line min-h-9 px-3 py-1 text-[13px] max-md:min-h-11" aria-label={`Call ${p.contact_name ?? p.tent_name} on ${p.contact_phone}`}>
                    <Phone className="size-4" aria-hidden /><span className="font-mono">{p.contact_phone}</span>
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="flex items-center gap-1.5 text-xs text-muted"><HandHeart className="size-3.5" aria-hidden />Tents appear here from the Pledged tents list in Setup. A picked-up tent’s food shows under Needs checking.</p>
    </section>
  );
}
