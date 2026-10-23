const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_AHEAD_MS = 5 * 60 * 1000;

/**
 * When a button was tapped, as an ISO string. Phones send the tap time because a tap made without signal arrives late.
 * Anything missing, invalid, from the future or more than a day old is replaced by "now".
 */
export function tapTime(at: unknown, now = Date.now()): string {
  const t = typeof at === "string" ? Date.parse(at) : NaN;
  return Number.isFinite(t) && t <= now + MAX_AHEAD_MS && t >= now - MAX_AGE_MS ? new Date(Math.min(t, now)).toISOString() : new Date(now).toISOString();
}
