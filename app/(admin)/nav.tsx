"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, CalendarDays, FileBarChart, History, Inbox, Route, Settings } from "lucide-react";

export const TABS = [
  ["/setup", "Setup", Settings],
  ["/event", "Event", CalendarDays],
  ["/intake", "Food intake", Inbox],
  ["/match", "Plan trips", Route],
  ["/live", "Live", Activity],
  ["/impact", "Impact", FileBarChart],
  ["/audit", "Audit log", History],
] as const;

/** Waiting work, shown as badges: batches to check on Food intake, approved portions not yet on a trip. */
export type NavCounts = { pendingBatches: number; portionsWaiting: number };

/** The events overview sits outside any event, so it has no event tabs. */
export const isOutsideEvent = (path: string) => path === "/";

/** Small count pill for a tab, or nothing when there is no waiting work. Orange: food to check. Sky blue: food to plan. */
export function TabBadge({ href, counts }: { href: string; counts: NavCounts }) {
  if (href === "/intake" && counts.pendingBatches > 0) {
    return (
      <span className="rounded-full bg-orange px-1.5 py-px font-mono text-[11px] font-semibold text-ink" aria-label={`${counts.pendingBatches} ${counts.pendingBatches === 1 ? "batch needs" : "batches need"} checking`}>
        {counts.pendingBatches}
      </span>
    );
  }
  if (href === "/match" && counts.portionsWaiting > 0) {
    return (
      <span className="rounded-full bg-sky px-1.5 py-px font-mono text-[11px] font-semibold text-ink" aria-label={`${counts.portionsWaiting} portions waiting`}>
        {counts.portionsWaiting}
      </span>
    );
  }
  return null;
}

export function Nav({ counts }: { counts: NavCounts }) {
  const path = usePathname();
  const active = useRef<HTMLAnchorElement>(null);

  // On narrow desktop windows the tab strip scrolls sideways; keep the current tab in view.
  useEffect(() => {
    active.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [path]);

  if (isOutsideEvent(path)) return null;

  return (
    <nav aria-label="Sections" className="no-print hidden md:flex -mx-4 mt-1 gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:gap-2 sm:px-0 [scrollbar-width:none]">
      {TABS.map(([href, label, Icon]) => {
        const on = path.startsWith(href);
        return (
          <Link
            key={href}
            ref={on ? active : undefined}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px flex flex-none items-center gap-2 border-b-2 px-2.5 pt-3.5 pb-3 text-sm font-medium transition-colors ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            <Icon className="size-4" aria-hidden />
            {label}
            <TabBadge href={href} counts={counts} />
          </Link>
        );
      })}
    </nav>
  );
}
