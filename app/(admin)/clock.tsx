"use client";
import { useEffect, useState } from "react";
import { TZ } from "@/lib/format";

const fmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

/** Live clock in Lagos time. Renders a blank placeholder until mounted to avoid a hydration mismatch. */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[13px] tabular-nums text-muted" title="Lagos time (WAT)">
      <span className="size-1.5 rounded-full bg-ok" aria-hidden />
      <span className="min-w-[4.5rem]">{now ? fmt.format(now) : " "}</span>
      <span className="text-[11px]">WAT</span>
    </span>
  );
}
