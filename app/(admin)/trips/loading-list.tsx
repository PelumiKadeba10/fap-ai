import type { SupabaseClient } from "@supabase/supabase-js";
import { fmtTime } from "@/lib/format";
import { TRIP_STATUS, groupStops } from "@/lib/trip-status";
import type { TripStatus } from "@/lib/types";
import { Pill } from "../ui";

type TripRow = { id: string; status: TripStatus; hub_id: string | null; buses: { name: string } | null; collection_points: { name: string } | null };
type Item = { id: string; qty: number; stop_order: number | null; site_id: string; batches: { food: string } | null; sites: { name: string; contact_name: string | null; contact_phone: string | null } | null };

export type LoadTrip = { id: string; status: TripStatus; bus: string | null; hub: string; total: number; stops: { order: number; site: Item["sites"]; items: Item[] }[] };

/** Which trips to load: one by id, or an event's trips that haven't left yet for one hub ("none" = no hub). */
export type TripFilter = { id: string } | { eventId: string; hub: string };

/** Loads trips with their stops and items for the loading lists. */
export async function loadTrips(supabase: SupabaseClient, filter: TripFilter): Promise<LoadTrip[]> {
  let q = supabase.from("trips").select("id, status, hub_id, buses(name), collection_points(name)");
  if ("id" in filter) q = q.eq("id", filter.id);
  else {
    q = q.eq("event_id", filter.eventId).in("status", ["planned", "loading"]);
    q = filter.hub === "none" ? q.is("hub_id", null) : q.eq("hub_id", filter.hub);
  }
  const { data } = await q.order("created_at");
  const trips = (data ?? []) as unknown as TripRow[];
  if (!trips.length) return [];
  const { data: rows } = await supabase
    .from("deliveries")
    .select("id, qty, stop_order, site_id, trip_id, batches(food), sites(name, contact_name, contact_phone)")
    .in("trip_id", trips.map((t) => t.id))
    .order("stop_order");
  const items = (rows ?? []) as unknown as (Item & { trip_id: string })[];
  return trips.map((t) => {
    const stops = groupStops(items.filter((i) => i.trip_id === t.id)).map((s) => ({ order: s.order, site: s.items[0].sites, items: s.items }));
    return {
      id: t.id, status: t.status, bus: t.buses?.name ?? null, hub: t.collection_points?.name ?? "No collection point",
      total: stops.reduce((n, s) => n + s.items.reduce((m, i) => m + i.qty, 0), 0), stops,
    };
  });
}

/** One trip's loading list: big type, checkboxes, stop order. Prints cleanly. */
export function LoadingList({ trip, printedAt }: { trip: LoadTrip; printedAt: Date }) {
  return (
    <article className="break-after-page flex flex-col gap-5 print:gap-3">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-3">
        <div>
          <p className="eyebrow !mb-1">Loading list · {trip.hub}</p>
          <h2 className="text-[28px] leading-tight font-semibold">{trip.bus ?? "No bus assigned yet"}</h2>
        </div>
        <div className="text-right">
          <p className="text-[32px] leading-none font-semibold tabular-nums"><span className="font-mono">{trip.total}</span> <span className="text-base font-medium text-muted">packs</span></p>
          <p className="mt-1 text-xs text-muted"><Pill tone={TRIP_STATUS[trip.status].tone}>{TRIP_STATUS[trip.status].label}</Pill> <span className="font-mono">printed {fmtTime(printedAt)}</span></p>
        </div>
      </header>

      <ol className="flex flex-col">
        {trip.stops.map((s) => (
          <li key={s.order} className="break-inside-avoid border-b border-line py-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-base font-semibold text-white print:border print:border-ink print:bg-white print:text-ink">{s.order}</span>
              <h3 className="text-xl font-semibold">{s.site?.name}</h3>
              {s.site?.contact_phone && <span className="font-mono text-sm text-muted">{s.site.contact_name ? `${s.site.contact_name} · ` : ""}{s.site.contact_phone}</span>}
            </div>
            <ul className="mt-3 flex flex-col gap-2 pl-0 sm:pl-12">
              {s.items.map((i) => (
                <li key={i.id}>
                  <label className="flex min-h-11 cursor-pointer items-center gap-3 text-lg">
                    <input type="checkbox" className="size-6 shrink-0 accent-[#111418]" />
                    <span className="font-mono font-semibold tabular-nums">{i.qty}</span>
                    <span>{i.batches?.food}</span>
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </article>
  );
}
