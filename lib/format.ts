// All times are shown and entered in Lagos time (UTC+1, no daylight saving).
export const TZ = "Africa/Lagos";
const LAGOS_OFFSET = "+01:00";

export function fmtTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));
}

export function fmtDateTime(d: Date | string): string {
  return new Intl.DateTimeFormat("en-NG", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));
}

/** Minutes as "1h 20m" / "45m"; negative values get a minus sign. */
export function fmtDur(min: number): string {
  const neg = min < 0;
  const m = Math.round(Math.abs(min));
  const s = m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
  return neg ? `−${s}` : s;
}

export const n0 = (v: number) => Math.round(v).toLocaleString("en-NG");

/** Today's date in Lagos as YYYY-MM-DD. */
export function lagosDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "20:15" today (Lagos) -> Date. Returns null for bad input. */
export function lagosTimeToday(hhmm: string, now = new Date()): Date | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return new Date(`${lagosDate(now)}T${String(h).padStart(2, "0")}:${m[2]}:00${LAGOS_OFFSET}`);
}

/** Date -> value for <input type="datetime-local"> in Lagos time. */
export function toLagosInput(d: Date | string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(d));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

/** <input type="datetime-local"> value (Lagos) -> ISO string. */
export function fromLagosInput(v: string): string {
  return new Date(`${v}:00${LAGOS_OFFSET}`).toISOString();
}

export const minutesBetween = (a: Date | string, b: Date | string) => (new Date(b).getTime() - new Date(a).getTime()) / 60000;
