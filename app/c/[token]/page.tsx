import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2, Phone } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtTime } from "@/lib/format";
import { PLEDGE_STATUS, byPickupTime, isLate } from "@/lib/pledges";
import type { Pledge } from "@/lib/types";
import { PickupButtons, PickupStatus } from "./pickup-actions";
import { ReportForm } from "./report-form";
import { EdibleForm } from "./edible-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report food · FAP AI", robots: { index: false }, manifest: "/manifest.webmanifest" };

type Point = { id: string; event_id: string; name: string; location_note: string | null; active: boolean; events: { name: string } | null };
type Sub = { id: string; food: string; qty: number; notes: string | null; review_status: "pending" | "approved"; photo_path: string | null; created_at: string };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string; ok?: string; photo?: string; tab?: string; done?: string }> }) {
  const { token } = await params;
  const { e, ok, photo, tab, done } = await searchParams;
  const db = createAdminClient();
  let cp: Point | null = null;
  if (/^[a-f0-9]{32}$/.test(token)) {
    const lookup = await db.from("collection_points").select("id, event_id, name, location_note, active, events(name)").eq("token", token).maybeSingle<Point>();
    cp = lookup.data;
    if (lookup.error) console.error("[collection-point] token lookup failed", { tokenSuffix: token.slice(-6), code: lookup.error.code, message: lookup.error.message, details: lookup.error.details, hint: lookup.error.hint });
  }

  if (!cp) {
    return (
      <Shell>
        <h1 className="text-2xl leading-tight font-semibold">Link not found</h1>
        <p className="text-base text-[#4a525c]">This link isn’t valid. Ask your coordinator to send it again.</p>
      </Shell>
    );
  }
  if (!cp.active) {
    return (
      <Shell>
        <h1 className="text-2xl leading-tight font-semibold">This link is switched off</h1>
        <p className="text-base text-[#4a525c]">Ask your coordinator if you still need to report food for {cp.name}.</p>
      </Shell>
    );
  }

  const pickupsTab = tab === "pickups";
  const { data: pledgeRows } = await db.from("pledges").select("*").eq("collection_point_id", cp.id).returns<Pledge[]>();
  const pledges = byPickupTime(pledgeRows ?? []);
  const openCount = pledges.filter((p) => p.status === "pledged" || p.status === "on_the_way").length;

  const [{ data: subs }, sent, edibleRow, collectedRows] = await Promise.all([
    db.from("batches").select("id, food, qty, notes, review_status, photo_path, created_at").eq("collection_point_id", cp.id).order("created_at", { ascending: false }).limit(5).returns<Sub[]>(),
    ok && UUID.test(ok)
      ? db.from("batches").select("id, food, qty, notes, review_status, photo_path, created_at").eq("id", ok).eq("collection_point_id", cp.id).maybeSingle<Sub>()
      : Promise.resolve({ data: null }),
    db.from("edible_counts").select("edible_packs, recorded_at").eq("event_id", cp.event_id).eq("collection_point_id", cp.id).maybeSingle<{ edible_packs: number; recorded_at: string }>(),
    db.from("batches").select("qty").eq("collection_point_id", cp.id),
  ]);
  const collected = (collectedRows.data ?? []).reduce((n, b) => n + b.qty, 0);
  const banner = sent.data;
  const unclear = banner?.notes === "Needs a quantity";

  return (
    <Shell>
      <div>
        <p className="text-base text-[#4a525c]">{cp.events?.name}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold">{cp.name}</h1>
        {cp.location_note && <p className="mt-1 text-base text-[#4a525c]">{cp.location_note}</p>}
      </div>

      <nav aria-label="Sections" className="grid grid-cols-2 gap-2">
        <Link href={`/c/${token}`} aria-current={pickupsTab ? undefined : "page"} className={`flex min-h-14 items-center justify-center rounded-xl border-2 border-ink px-3 text-center text-lg font-semibold ${pickupsTab ? "bg-white text-ink" : "bg-ink text-white"}`}>Report food</Link>
        <Link href={`/c/${token}?tab=pickups`} aria-current={pickupsTab ? "page" : undefined} className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-ink px-3 text-center text-lg font-semibold ${pickupsTab ? "bg-ink text-white" : "bg-white text-ink"}`}>
          Pick-ups{openCount > 0 && <span className="rounded-full bg-orange px-2 py-0.5 font-mono text-sm text-white">{openCount}</span>}
        </Link>
      </nav>

      <PickupStatus token={token} banner={pickupsTab} />

      {pickupsTab && <Pickups token={token} pledges={pledges} done={done} />}

      {!pickupsTab && banner && (
        <p role="status" className="flex items-start gap-2 rounded-xl border-2 border-ok bg-[#e9f6ee] px-4 py-3 text-base font-medium text-[#14633a]">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            Sent: {banner.qty} boxes/cartons of {banner.food}. The coordinator will confirm it.
            {photo === "skipped" && <span className="mt-1 block text-[#6b4a08]">Photo not saved: use a JPG or PNG under 4 MB.</span>}
          </span>
        </p>
      )}
      {e && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />{e}
        </p>
      )}

      {!pickupsTab && (<>
      <ReportForm token={token} />
      <EdibleForm token={token} collected={collected} current={edibleRow.data?.edible_packs ?? null} />

      <section aria-labelledby="recent">
        <h2 id="recent" className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">Your last sends</h2>
        {!subs?.length ? (
          <p className="mt-2 text-base text-[#4a525c]">Nothing sent yet.</p>
        ) : (
          <ul className="mt-1">
            {subs.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 border-b border-line py-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{s.qty} × {s.food}{s.photo_path && <Camera className="ml-1.5 inline size-4 align-text-bottom text-[#4a525c]" aria-label="Has a photo" role="img" />}</p>
                  <p className="font-mono text-sm text-[#4a525c]">{fmtTime(s.created_at)}</p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${s.review_status === "approved" ? "text-ok" : "text-warn"}`}>
                  {s.review_status === "approved" ? "Confirmed" : "Waiting for check"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      </>)}
    </Shell>
  );
}

const DONE: Record<string, string> = { on_the_way: "Marked: on your way.", picked_up: "Saved. The coordinator will check the food.", no_food: "Marked: no food." };

/** This collection point's pledged tents by pick-up time, with the three buttons. */
function Pickups({ token, pledges, done }: { token: string; pledges: Pledge[]; done?: string }) {
  const now = new Date();
  return (
    <section aria-labelledby="pickups" className="flex flex-col gap-4">
      <h2 id="pickups" className="sr-only">Pick-ups</h2>
      {done && DONE[done] && (
        <p role="status" className="flex items-start gap-2 rounded-xl border-2 border-ok bg-[#e9f6ee] px-4 py-3 text-base font-medium text-[#14633a]">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />{DONE[done]}
        </p>
      )}
      {pledges.length === 0 && <p className="text-base text-[#4a525c]">No pick-ups for this collection point yet.</p>}
      <ul className="flex flex-col gap-4">
        {pledges.map((p) => {
          const st = PLEDGE_STATUS[p.status];
          const open = p.status === "pledged" || p.status === "on_the_way";
          const late = isLate(p, now);
          return (
            <li key={p.id} className={`rounded-2xl border p-4 ${late ? "border-[3px] border-crit" : "border-[#dde2e7]"} ${open ? "bg-white" : "bg-soft"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xl leading-tight font-semibold break-words">{p.tent_name}</p>
                  <p className="mt-1 text-base text-[#4a525c]">
                    {p.pickup_from ? <>From <b className="font-mono">{fmtTime(p.pickup_from)}</b></> : "No pick-up time set"}
                    {p.pledged_packs != null && <> · <b className="font-mono">{p.pledged_packs}</b> packs pledged</>}
                  </p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${p.status === "picked_up" ? "text-ok" : p.status === "no_food" ? "text-warn" : p.status === "on_the_way" ? "text-blue" : "text-[#4a525c]"}`}>{st.label}</span>
              </div>
              {late && <p className="mt-2 flex items-center gap-2 text-base font-semibold text-crit"><AlertTriangle className="size-5 shrink-0" aria-hidden />Late: not picked up yet</p>}
              {p.status === "picked_up" && <p className="mt-2 text-base">Picked up <b className="font-mono">{p.picked_up_packs ?? "?"}</b> packs{p.picked_up_at && <> at <b className="font-mono">{fmtTime(p.picked_up_at)}</b></>}</p>}
              {open && p.contact_phone && (
                <a href={"tel:" + p.contact_phone} className="mt-3 flex min-h-14 items-center gap-3 rounded-xl border-2 border-ink bg-white px-4 py-2 text-ink active:bg-soft">
                  <Phone className="size-6 shrink-0" aria-hidden />
                  <span className="min-w-0"><span className="block text-sm text-[#4a525c]">Tap to call{p.contact_name ? " " + p.contact_name : ""}</span><span className="block font-mono text-lg font-semibold break-all">{p.contact_phone}</span></span>
                </a>
              )}
              {open && <PickupButtons token={token} pledge={{ id: p.id, tent: p.tent_name, status: p.status as "pledged" | "on_the_way", packs: p.pledged_packs }} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[17px]">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fap-logo.png" alt="Feed a Person" className="h-7 w-auto" />
        <b>FAP <span className="text-blue">AI</span></b>
      </div>
      {children}
    </main>
  );
}
