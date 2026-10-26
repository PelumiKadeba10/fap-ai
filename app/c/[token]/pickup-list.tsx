"use client";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Phone, Search } from "lucide-react";
import type { Pledge } from "@/lib/types";
import { fmtTime } from "@/lib/format";
import { LATE_PICKUP_MIN, PLEDGE_STATUS, isLate } from "@/lib/pledges";
import { PickupButtons } from "./pickup-actions";

export function PickupList({ token, pledges, done }: { token: string; pledges: Pledge[]; done?: string }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(() => pledges.filter((p) => {
    const text = [p.student_name, p.tent_number, p.matric_number, p.tent_name, p.contact_name, p.contact_phone].filter(Boolean).join(" ").toLowerCase();
    return (!normalized || text.includes(normalized)) && (status === "all" || p.status === status);
  }), [pledges, normalized, status]);
  const confirmed = pledges.filter((p) => p.status === "picked_up").length;

  return (
    <section aria-labelledby="pickups" className="flex flex-col gap-4">
      <h2 id="pickups" className="sr-only">Pick-ups</h2>
      {done && <p role="status" className="rounded-xl border-2 border-ok bg-[#e9f6ee] px-4 py-3 text-base font-medium text-[#14633a]">{done === "picked_up" ? "Pickup confirmed." : done === "no_food" ? "Marked as no food." : "Pickup updated."}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-[#4a525c]">
        <span><b className="font-mono text-ink">{confirmed}</b> of <b className="font-mono text-ink">{pledges.length}</b> pickups confirmed</span>
        <span className="font-mono">{visible.length} shown</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search pickups</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-[#6b7480]" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search student, tent or matric number" className="min-h-12 w-full rounded-xl border-2 border-ink bg-white py-2 pl-10 pr-3 text-base text-ink" />
        </label>
        <label className="sm:w-44">
          <span className="sr-only">Filter pickup status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-12 w-full rounded-xl border-2 border-ink bg-white px-3 text-base text-ink">
            <option value="all">All statuses</option><option value="pledged">Awaiting pickup</option><option value="on_the_way">On the way</option><option value="picked_up">Picked up</option><option value="no_food">No food</option>
          </select>
        </label>
      </div>
      {visible.length === 0 && <p className="rounded-xl border border-[#dde2e7] px-4 py-5 text-base text-[#4a525c]">No pickups match that search.</p>}
      <ul className="flex flex-col gap-4">
        {visible.map((p) => {
          const st = PLEDGE_STATUS[p.status];
          const open = p.status === "pledged" || p.status === "on_the_way";
          const late = isLate(p, now);
          const title = p.tent_number ?? p.tent_name;
          return (
            <li key={p.id} className={`rounded-2xl border p-4 ${late ? "border-[3px] border-crit" : "border-[#dde2e7]"} ${open ? "bg-white" : "bg-soft"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xl leading-tight font-semibold break-words">{title}</p>
                  <p className="mt-1 break-words text-base text-[#4a525c]">{p.student_name ?? p.contact_name ?? "Student not listed"}{p.matric_number && <> · <b className="font-mono">{p.matric_number}</b></>}</p>
                  <p className="mt-1 text-sm text-[#4a525c]">
                    {p.pickup_from ? <>From <b className="font-mono">{fmtTime(p.pickup_from)}</b></> : "No pick-up time set"}
                    {p.pledged_packs != null && <> · <b className="font-mono">{p.pledged_packs}</b> packs pledged</>}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${p.status === "picked_up" ? "text-ok" : p.status === "no_food" ? "text-warn" : p.status === "on_the_way" ? "text-blue" : "text-[#4a525c]"}`}>{st.label}</span>
              </div>
              {late && <p className="mt-2 flex items-center gap-2 text-base font-semibold text-crit"><AlertTriangle className="size-5 shrink-0" aria-hidden />Late: not picked up yet</p>}
              {p.status === "picked_up" && <p className="mt-2 text-base">Picked up <b className="font-mono">{p.picked_up_packs ?? "?"}</b> packs{p.picked_up_at && <> at <b className="font-mono">{fmtTime(p.picked_up_at)}</b></>}</p>}
              {open && p.contact_phone && <a href={`tel:${p.contact_phone}`} className="mt-3 flex min-h-14 items-center gap-3 rounded-xl border-2 border-ink bg-white px-4 py-2 text-ink active:bg-soft"><Phone className="size-6 shrink-0" aria-hidden /><span className="min-w-0"><span className="block text-sm text-[#4a525c]">Tap to call{p.contact_name ? ` ${p.contact_name}` : ""}</span><span className="block font-mono text-lg font-semibold break-all">{p.contact_phone}</span></span></a>}
              {open && <PickupButtons token={token} pledge={{ id: p.id, tent: title, status: p.status as "pledged" | "on_the_way", packs: p.pledged_packs }} />}
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-[#4a525c]">Search covers student name, tent number, matric number, contact name and phone.</p>
    </section>
  );
}
