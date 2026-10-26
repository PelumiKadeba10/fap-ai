import type { Metadata } from "next";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { findBusLink, findCurrentTrip, findEarlierTrips, type EarlierTrip } from "@/lib/bus-trip";
import { fmtPacks } from "@/lib/cartons";
import { fmtTime } from "@/lib/format";
import { groupStops, stopStatus } from "@/lib/trip-status";
import type { DeliveryStatus } from "@/lib/types";
import { OfflineSetup } from "@/components/offline-setup";
import { FieldChat } from "@/components/field-chat";
import { FieldTabs } from "@/components/field-tabs";
import { unreadFromAdmin } from "@/lib/messages";
import { AutoRefresh } from "./auto-refresh";
import { BusTrip, type StopView } from "./bus-trip";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My trip · FAP AI", robots: { index: false } };

type Item = {
  id: string; qty: number; status: DeliveryStatus; stop_order: number | null; safe_until: string; site_id: string;
  batches: { food: string } | null;
  sites: { name: string; contact_name: string | null; contact_phone: string | null } | null;
};

/** One link per bus per event: shows the bus's current trip, or waits for the next one. */
export default async function BusPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string; tab?: string }> }) {
  const { token } = await params;
  const { e, tab } = await searchParams;
  const messagesTab = tab === "messages";
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

  const [{ data: who }, trip, earlier] = await Promise.all([
    db.from("bus_links").select("buses(name), events(name, packs_per_carton, bus_ready_by)").eq("id", link.id).maybeSingle<{ buses: { name: string } | null; events: { name: string; packs_per_carton: number | null; bus_ready_by: string | null } | null }>(),
    findCurrentTrip(db, link),
    findEarlierTrips(db, link),
  ]);
  const perCarton = who?.events?.packs_per_carton ?? null;
  const busName = who?.buses?.name ?? "Your bus";
  const unread = messagesTab ? 0 : await unreadFromAdmin(db, "bus", token);
  const tabs = <FieldTabs tabs={[{ href: `/b/${token}`, label: "My trip", on: !messagesTab }, { href: `/b/${token}?tab=messages`, label: "Messages", on: messagesTab, badge: unread }]} />;
  if (messagesTab) {
    return (
      <Shell>
        <div>
          <p className="text-base text-[#4a525c]">{busName}{who?.events?.name ? " · " + who.events.name : ""}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold">Messages</h1>
        </div>
        {tabs}
        <FieldChat channel="bus" token={token} />
      </Shell>
    );
  }
  const alert = e && (
    <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit">
      <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />{e}
    </p>
  );

  if (!trip) {
    const packs = earlier.reduce((n, t) => n + t.packs, 0);
    return (
      <Shell>
        <AutoRefresh />
        <OfflineSetup />
        {tabs}
        <div>
          <p className="text-base text-[#4a525c]">{busName}{who?.events?.name ? " · " + who.events.name : ""}</p>
          <h1 className="mt-1 text-[28px] leading-tight font-semibold">Free · no trip right now.</h1>
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
            <span className="font-mono font-semibold">{earlier.length}</span> {earlier.length === 1 ? "trip" : "trips"} · <span className="font-mono font-semibold">{packs}</span> packs delivered
          </p>
        </section>
        <EarlierTrips trips={earlier} perCarton={perCarton} />
        {who?.events?.bus_ready_by && <p className="text-sm text-[#4a525c]">Bus at the collection point by <b className="font-mono">{fmtTime(who.events.bus_ready_by)}</b>.</p>}
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
  const view: StopView[] = stops.map((s) => ({
    order: s.order, status: s.status, safeUntil: s.safeUntil, site: s.site,
    items: s.items.map((i) => ({ id: i.id, qty: i.qty, food: i.batches?.food ?? "" })),
  }));
  const hub = trip.collection_points?.name ?? "the collection point";

  return (
    <Shell>
      {tabs}
      <BusTrip
        token={token} busName={busName} perCarton={perCarton} nowIso={new Date().toISOString()} alert={alert} stops={view}
        trip={{ id: trip.id, status: trip.status, tripNo: trip.trip_no, departedAt: trip.departed_at, hub }}
      />

      <EarlierTrips trips={earlier} perCarton={perCarton} />

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

/** Earlier trips of tonight, collapsed so the current trip stays the only thing on screen. */
function EarlierTrips({ trips, perCarton }: { trips: EarlierTrip[]; perCarton: number | null }) {
  if (!trips.length) return null;
  return (
    <details className="group border-t border-line pt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-base font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-5 transition-transform group-open:rotate-90" aria-hidden />
        Earlier trips <span className="font-mono text-[#4a525c]">({trips.length})</span>
      </summary>
      <ul className="mt-2">
        {trips.map((t) => (
          <li key={t.id} className="border-b border-line py-3">
            <p className="font-semibold break-words">{t.trip_no ? `Trip ${t.trip_no}` : "Trip"} · {t.hub}</p>
            <p className="text-sm text-[#4a525c]">
              <span className="font-mono">{t.stops}</span> {t.stops === 1 ? "stop" : "stops"} · <span className="font-mono">{fmtPacks(t.packs, perCarton)}</span> delivered{t.returned_at && <> · back at <span className="font-mono">{fmtTime(t.returned_at)}</span></>}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
