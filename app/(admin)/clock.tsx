"use client";
import { useEffect, useState } from "react";
import { TZ } from "@/lib/format";

const fmt = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true });

/** Live clock in Lagos time. Renders empty until mounted to avoid a hydration mismatch. */
export function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-[13px] tabular-nums text-muted" title="Lagos time (WAT)">
      {now ? fmt.format(now) : " "} <span className="text-[11px]">WAT</span>
    </span>
  );
}
