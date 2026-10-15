import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, MapPin, Phone, RefreshCw, Timer } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { findBusLink, findCurrentTrip } from "@/lib/bus-trip";
import { fmtDur, fmtTime, minutesBetween } from "@/lib/format";
import { ATTENTION_MIN } from "@/lib/status";
import { TRIP_STATUS, groupStops, stopStatus } from "@/lib/trip-status";
import type { DeliveryStatus } from "@/lib/types";
import { SubmitButton } from "@/components/submit-button";
import { busAction } from "./actions";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My trip · FAP AI", robots: { index: false } };

type Item = {
  id: string; qty: number; status: DeliveryStatus; stop_order: number | null; safe_until: string; site_id: string;
  batches: { food: string } | null;
  sites: { name: string; contact_name: string | null; contact_phone: string | null } | null;
};

/** One link per bus per event: shows the bus's current trip, or waits for the next one. */
export default async function BusPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const { e } = await searchParams;
  const db = createAdminClient();
  const link = await findBusLink(db, token);

  if (!link) {
    return (
      <Shell>
        <h1 className="text-2xl leading-tight font-semibold">Link not found</h1>
        <p className="text-base text-[#4a525c]">This bus link isn’t valid. Ask your coordinator to send it again.</p>
      </Shell>
    );
  }

  const [{ data: who }, trip] = await Promise.all([
    db.from("bus_links").select("buses(name), events(name)").eq("id", link.id).maybeSingle<{ buses: { name: string } | null; events: { name: string } | null }>(),
    findCurrentTrip(db, link),
  ]);
  const busName = who?.buses?.name ?? "Your bus";
  const alert = e && (
    <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />{e}
    </p>
  );

  if (!trip) {
    // Completed trips tonight, so the lead can see their night so far.
    const { data: finished } = await db.from("trips").select("id").eq("event_id", link.event_id).eq("bus_id", link.bus_id).eq("status", "returned");
    const ids = (finished ?? []).map((t) => t.id as string);
    const { data: delivered } = ids.length ? await db.from("deliveries").select("qty").in("trip_id", ids).eq("status", "delivered") : { data: [] as { qty: number }[] };
    const packs = (delivered ?? []).reduce((n, d) => n + d.qty, 0);
    return (
      <Shell>
        <AutoRefresh />
        <div>
          <p className="text-base text-[#4a525c]">{busName}{who?.events?.name ? " · " + who.events.name : ""}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold">No trip right now.</h1>
          <p className="mt-2 text-lg">Keep this page open: your next trip will appear here.</p>
        </div>
        {alert}
        <a href={"/b/" + token} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white active:opacity-80">
          <RefreshCw className="size-6" aria-hidden />Refresh
        </a>
        <p className="text-sm text-[#4a525c]">This page checks for a new trip every 30 seconds.</p>
        <section aria-labelledby="done" className="border-t border-line pt-4">
          <h2 id="done" className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">Done tonight</h2>
          <p className="mt-1 text-lg">
            <span className="font-mono font-semibold">{ids.length}</span> {ids.length === 1 ? "trip" : "trips"} · <span className="font-mono font-semibold">{packs}</span> packs delivered
          </p>
        </section>
      </Shell>
    );
  }

  const { data: rows } = await db
    .from("deliveries")
    .select("id, qty, status, stop_order, safe_until, site_id, batches(food), sites(name, contact_name, contact_phone)")
    .eq("trip_id", trip.id)
    .order("stop_order")
    .returns<Item[]>();
  const stops = groupStops(rows ?? []).map((s) => ({
    ...s,
    status: stopStatus(s.items.map((i) => i.status)),
    safeUntil: s.items.reduce((m, i) => (i.safe_until < m ? i.safe_until : m), s.items[0].safe_until),
    site: s.items[0].sites,
  }));
  const total = stops.reduce((t, s) => t + s.items.reduce((n, i) => n + i.qty, 0), 0);
  const doneCount = stops.filter((s) => s.status === "delivered").length;
  const next = stops.find((s) => s.status !== "delivered");
  const onRoad = trip.status === "departed";
  const hub = trip.collection_points?.name ?? "the collection point";

  return (
    <Shell>
      <div>
        <p className="text-base text-[#4a525c]">{busName} · {TRIP_STATUS[trip.status].label}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold"><span className="font-mono">{total}</span> packs from {hub}</h1>
        <p className="mt-2 text-base text-[#4a525c]">{stops.length} {stops.length === 1 ? "stop" : "stops"}{trip.departed_at && <> · left at <span className="font-mono">{fmtTime(trip.departed_at)}</span></>}</p>
      </div>

      {alert}

      {onRoad && stops.length > 0 && (
        <p className="text-lg font-semibold" aria-live="polite">
          {next ? <>Stop <span className="font-mono">{doneCount + 1}</span> of <span className="font-mono">{stops.length}</span></> : "All stops done"}
        </p>
      )}

      {(trip.status === "planned" || trip.status === "loading") && (
        <form action={busAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="trip" value={trip.id} />
          <input type="hidden" name="intent" value="depart" />
          <p className="mb-3 text-base text-[#4a525c]">{trip.status === "loading" ? "Loading at " + hub + "." : "Wait at " + hub + " while the food is loaded."} Tap when the bus is full and moving.</p>
          <SubmitButton className="min-h-16 w-full rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white active:opacity-80" pendingText="Sending…">Loaded, leaving now</SubmitButton>
        </form>
      )}

      <ol className="flex flex-col gap-4">
        {stops.map((s) => {
          const isNext = onRoad && next?.order === s.order;
          const done = s.status === "delivered";
          const left = minutesBetween(new Date(), s.safeUntil);
          const urgent = !done && left < ATTENTION_MIN;
          return (
            <li key={s.order} aria-current={isNext ? "step" : undefined} className={`rounded-2xl p-4 ${isNext ? "border-[3px] border-ink" : "border border-[#dde2e7]"} ${done ? "bg-soft" : "bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">{isNext ? "Next stop" : "Stop " + s.order}</p>
                  <p className="mt-0.5 flex items-start gap-1.5 text-2xl leading-tight font-semibold break-words">
                    <MapPin className="mt-1 size-6 shrink-0" aria-hidden />{s.site?.name}
                  </p>
                </div>
                {done && <span className="flex shrink-0 items-center gap-1 text-base font-semibold text-ok"><CheckCircle2 className="size-5" aria-hidden />Delivered</span>}
                {s.status === "delayed" && <span className="flex shrink-0 items-center gap-1 text-base font-semibold text-warn"><AlertTriangle className="size-5" aria-hidden />Problem</span>}
              </div>

              <ul className="mt-2 text-lg">
                {s.items.map((i) => <li key={i.id}><span className="font-mono font-semibold">{i.qty}</span> {i.batches?.food}</li>)}
              </ul>

              {!done && (
                <p className={`mt-2 flex items-center gap-2 text-base ${urgent ? "font-semibold text-crit" : "text-[#4a525c]"}`}>
                  {urgent ? <AlertTriangle className="size-5 shrink-0" aria-hidden /> : <Timer className="size-5 shrink-0" aria-hidden />}
                  Safe until <b className="font-mono">{fmtTime(s.safeUntil)}</b> · {left > 0 ? fmtDur(left) + " left" : fmtDur(-left) + " late"}
                </p>
              )}

              {!done && s.site?.contact_phone && (
                <a href={"tel:" + s.site.contact_phone} className="mt-3 flex min-h-14 items-center gap-3 rounded-xl border-2 border-ink bg-white px-4 py-2 text-ink active:bg-soft">
                  <Phone className="size-6 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm text-[#4a525c]">Tap to call{s.site.contact_name ? " " + s.site.contact_name : ""}</span>
                    <span className="block font-mono text-lg font-semibold">{s.site.contact_phone}</span>
                  </span>
                </a>
              )}

              {onRoad && !done && (
                <div className="mt-3 flex flex-col gap-3">
                  <form action={busAction}>
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="trip" value={trip.id} />
                    <input type="hidden" name="intent" value="delivered" />
                    <input type="hidden" name="stop" value={s.order} />
                    <SubmitButton className="min-h-16 w-full rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white active:opacity-80" pendingText="Sending…">Delivered here</SubmitButton>
                  </form>
                  {s.status !== "delayed" && (
                    <form action={busAction}>
                      <input type="hidden" name="token" value={token} />
                      <input type="hidden" name="trip" value={trip.id} />
                      <input type="hidden" name="intent" value="problem" />
                      <input type="hidden" name="stop" value={s.order} />
                      <SubmitButton className="min-h-14 w-full rounded-xl border-2 border-ink bg-white px-4 py-3 text-lg font-semibold text-ink active:opacity-80" pendingText="Sending…">Problem at this stop</SubmitButton>
                    </form>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {onRoad && !next && stops.length > 0 && (
        <form action={busAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="trip" value={trip.id} />
          <input type="hidden" name="intent" value="return" />
          <SubmitButton className="min-h-16 w-full rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white active:opacity-80" pendingText="Sending…">Back at collection point</SubmitButton>
        </form>
      )}
      {onRoad && next && <p className="text-sm text-[#4a525c]">“Back at collection point” appears once every stop is delivered.</p>}

      <p className="text-sm text-[#4a525c]">Keep this link for the whole night. Your next trip will appear on this page.</p>
    </Shell>
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
