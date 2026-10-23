"use client";
import { useEffect } from "react";

/**
 * Saves this page and its scripts on the phone so it opens without signal (see public/sw.js).
 * Production only: in development the scripts change constantly. Renders nothing.
 */
export function OfflineSetup() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").then(() => navigator.serviceWorker.ready).then(async () => {
      const cache = await caches.open("fap-shell-v1");
      const here = location.origin + location.pathname;
      const assets = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => n.startsWith(location.origin + "/_next/static/") || n.endsWith("/fap-logo.png"));
      await Promise.all([here, ...assets].map((u) => cache.add(u).catch(() => {})));
    }).catch(() => {});
  }, []);
  return null;
}

/** Banner for when the phone has no connection. */
export function OfflineBanner({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="rounded-xl border-2 border-warn bg-[#fff6e5] px-4 py-3 text-base font-medium text-[#6b4a08]">{children}</p>
  );
}
