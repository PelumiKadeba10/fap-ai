import type { Pledge, PledgeStatus } from "./types";

/** A tent not picked up this long after its pick-up time is flagged on Food intake. */
export const LATE_PICKUP_MIN = 30;

export const PLEDGE_STATUS: Record<PledgeStatus, { label: string; tone: "muted" | "blue" | "orange" | "red" | "green" }> = {
  pledged: { label: "Pledged", tone: "muted" },
  on_the_way: { label: "On the way", tone: "blue" },
  picked_up: { label: "Picked up", tone: "green" },
  no_food: { label: "No food", tone: "orange" },
};

/** Not collected yet: pledged or on the way. */
export const isOpen = (s: PledgeStatus) => s === "pledged" || s === "on_the_way";

/** Still to be collected and more than `LATE_PICKUP_MIN` minutes past its pick-up time. */
export function isLate(p: Pick<Pledge, "status" | "pickup_from">, now: Date): boolean {
  if (!isOpen(p.status) || !p.pickup_from) return false;
  return now.getTime() - new Date(p.pickup_from).getTime() > LATE_PICKUP_MIN * 60000;
}

export function pledgeCounts(pledges: Pick<Pledge, "status">[]): Record<PledgeStatus, number> {
  const c: Record<PledgeStatus, number> = { pledged: 0, on_the_way: 0, picked_up: 0, no_food: 0 };
  for (const p of pledges) c[p.status]++;
  return c;
}

/** Earliest pick-up time first; pledges without a time go last. */
export function byPickupTime<T extends Pick<Pledge, "pickup_from" | "tent_name">>(list: T[]): T[] {
  const t = (p: T) => (p.pickup_from ? new Date(p.pickup_from).getTime() : Infinity);
  return [...list].sort((a, b) => t(a) - t(b) || a.tent_name.localeCompare(b.tent_name));
}

export interface PastedPledge {
  tent_name: string;
  student_name: string;
  tent_number: string;
  matric_number: string | null;
  contact_phone: string | null;
  pledged_packs: number | null;
}

/** New format: "Student name, tent number, matric number, phone, packs". The old three-column format remains supported. */
export function parsePledgeList(text: string): PastedPledge[] {
  const out: PastedPledge[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(",").map((x) => x.trim());
    if (!parts[0]) continue;
    const modern = parts.length >= 5;
    const packsPart = modern ? parts[4] : parts[2];
    const packs = packsPart ? Number(packsPart.replace(/\D/g, "")) : NaN;
    out.push({
      tent_name: (modern ? parts[1] : parts[0]).slice(0, 60),
      student_name: parts[0].slice(0, 120),
      tent_number: (modern ? parts[1] : parts[0]).slice(0, 30),
      matric_number: modern && parts[2] ? parts[2].slice(0, 30) : null,
      contact_phone: (modern ? parts[3] : parts[1]) ? (modern ? parts[3] : parts[1]).slice(0, 30) : null,
      pledged_packs: Number.isFinite(packs) && packsPart !== "" ? packs : null,
    });
  }
  return out;
}
