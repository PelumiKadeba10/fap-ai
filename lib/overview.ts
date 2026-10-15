export type EventPhase = "live" | "upcoming" | "past";

const HOUR = 3600_000;

/** Live from the start until the event's duration plus 6 hours (clean-up and late deliveries) has passed. */
export function eventPhase(e: { starts_at: string; duration_hours: number }, now: Date = new Date()): EventPhase {
  const start = new Date(e.starts_at).getTime();
  if (now.getTime() < start) return "upcoming";
  return now.getTime() <= start + (Number(e.duration_hours) + 6) * HOUR ? "live" : "past";
}
