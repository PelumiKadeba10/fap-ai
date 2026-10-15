"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the page every 30 seconds so the bus lead's next trip appears by itself. Does nothing without JavaScript. */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
