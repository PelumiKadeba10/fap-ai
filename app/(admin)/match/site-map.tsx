import type { Site } from "@/lib/types";
import type { Allocation } from "@/lib/match";
import { siteNeed, sitePosition } from "@/lib/match";

/** Schematic map: venue in the middle, sites placed by road distance and direction. Not to GPS scale. */
export function SiteMap({ sites, allocations, urgentBatchIds, routeColor }: {
  sites: Site[];
  allocations: Pick<Allocation, "siteId" | "batchId">[];
  urgentBatchIds?: Set<string>;
  routeColor?: (a: Pick<Allocation, "siteId" | "batchId">, i: number) => string;
}) {
  const pts = sites.map((s) => ({ s, ...sitePosition(Number(s.km), s.direction) }));
  const R = Math.max(3, ...pts.map((p) => Math.hypot(p.x, p.y))) * 1.18;
  const W = 640, H = 520, cx = W / 2, cy = H / 2, k = Math.min(W, H) / 2 / R;
  const X = (x: number) => cx + x * k, Y = (y: number) => cy - y * k;
  const byId = new Map(pts.map((p) => [p.s.id, p]));

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Schematic map of beneficiary sites around the venue" className="block h-auto w-full">
        {[0.25, 0.5, 0.75, 1].map((f) => <circle key={f} cx={cx} cy={cy} r={f * R * k} fill="none" stroke="#f0f2f4" />)}
        {allocations.map((a, i) => {
          const p = byId.get(a.siteId);
          if (!p) return null;
          const color = routeColor ? routeColor(a, i) : urgentBatchIds?.has(a.batchId) ? "#f2a03d" : "#2aa3ee";
          return <line key={i} x1={cx} y1={cy} x2={X(p.x)} y2={Y(p.y)} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.85} />;
        })}
        {pts.map(({ s, x, y }) => {
          const r = 7 + Math.sqrt(siteNeed(s)) * 0.8;
          return (
            <g key={s.id}>
              <circle cx={X(x)} cy={Y(y)} r={r} fill="#fff" stroke="#6b7480" strokeWidth={1.5} />
              <text x={X(x)} y={Y(y) + r + 16} textAnchor="middle" fontSize={14} fontWeight={600} fill="#111418">{s.name}</text>
              <text x={X(x)} y={Y(y) + r + 32} textAnchor="middle" fontSize={12} fill="#6b7480">{Number(s.km)} km · need {siteNeed(s)}</text>
            </g>
          );
        })}
        <rect x={cx - 9} y={cy - 9} width={18} height={18} rx={3} fill="#111418" />
        <text x={cx + 16} y={cy + 5} fontSize={13} fontWeight={600} fill="#111418">Venue</text>
      </svg>
    </div>
  );
}
