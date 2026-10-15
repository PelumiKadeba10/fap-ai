import type { DeliveryStatus } from "@/lib/types";
import type { UrgencyLevel } from "@/lib/urgency";
import { STATUS } from "@/lib/status";

const TONE = { muted: "text-muted", blue: "text-blue", orange: "text-warn", red: "text-crit", green: "text-ok" } as const;
const DOT = "before:mr-1.5 before:inline-block before:size-[7px] before:rounded-full before:bg-current";

export function UrgencyPill({ level, score }: { level: UrgencyLevel; score?: number }) {
  const cls = level === "high" ? "text-crit" : level === "med" ? "text-warn" : "text-ok";
  const label = level === "high" ? "High" : level === "med" ? "Medium" : "Low";
  return <span className={`inline-flex items-center text-[12.5px] font-medium whitespace-nowrap ${cls} ${DOT}`}>{label}{score != null ? ` · ${score}` : ""}</span>;
}

export function StatusPill({ status }: { status: DeliveryStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex items-center text-[12.5px] font-medium whitespace-nowrap ${TONE[s.tone]} ${DOT}`}>{s.label}</span>;
}

/** On phones, tables become stacked cards: each <td> shows its column name from data-label. */
export const cardTable = "max-md:[&_thead]:hidden max-md:[&_tr]:grid max-md:[&_tr]:grid-cols-2 max-md:[&_tr]:gap-x-3.5 max-md:[&_tr]:gap-y-2.5 max-md:[&_tr]:border-b max-md:[&_tr]:border-line max-md:[&_tr]:py-3.5 max-md:[&_td]:block max-md:[&_td]:border-0 max-md:[&_td]:p-0 max-md:[&_td]:before:block max-md:[&_td]:before:text-[11.5px] max-md:[&_td]:before:text-muted max-md:[&_td]:before:content-[attr(data-label)] max-md:[&_td:last-child]:col-span-2 w-full border-collapse text-sm";
