import { n0 } from "@/lib/format";
import type { FoodCountRow } from "@/lib/food-counts";

export function FoodCountSummary({ rows, names = {} }: { rows: FoodCountRow[]; names?: Record<string, string> }) {
  if (!rows.length) return null;
  const total = (key: keyof FoodCountRow) => rows.reduce((n, r) => n + (typeof r[key] === "number" ? r[key] as number : 0), 0);
  const overall: FoodCountRow = { hubId: "overall", collected: total("collected"), edible: rows.some((r) => r.edible == null) ? null : total("edible"), loaded: rows.some((r) => r.loaded == null) ? null : total("loaded"), delivered: total("delivered"), discarded: rows.some((r) => r.discarded == null) ? null : total("discarded"), notLoaded: rows.some((r) => r.notLoaded == null) ? null : total("notLoaded") };
  return <section className="flex flex-col gap-4" aria-labelledby="food-counts">
    <div><h2 id="food-counts" className="h2">Food counts</h2><p className="text-sm text-muted">Collected → edible → loaded → delivered.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      {[overall, ...rows].map((r) => <article key={r.hubId} className="rounded-xl border border-line p-4">
        <h3 className="font-semibold">{r.hubId === "overall" ? "Overall" : r.hubId === "none" ? "No collection point" : names[r.hubId] ?? r.hubId}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Count label="Collected" value={r.collected} />
          <Count label="Edible" value={r.edible} />
          <Count label="Loaded" value={r.loaded} />
          <Count label="Delivered" value={r.delivered} />
          <Count label="Discarded" value={r.discarded} />
          <Count label="Not loaded" value={r.notLoaded} />
        </dl>
      </article>)}
    </div>
  </section>;
}
function Count({ label, value }: { label: string; value: number | null }) { return <div><dt className="text-muted">{label}</dt><dd className={`font-mono font-semibold ${value == null ? "text-warn" : ""}`}>{value == null ? "Missing" : n0(value)}</dd></div>; }
