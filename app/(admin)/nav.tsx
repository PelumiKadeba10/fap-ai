"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, FileBarChart, Inbox, Radio, Route } from "lucide-react";

export const TABS = [
  ["/event", "Event", CalendarDays],
  ["/intake", "Food intake", Inbox],
  ["/match", "Plan trips", Route],
  ["/live", "Live", Radio],
  ["/impact", "Impact", FileBarChart],
] as const;

/** Waiting work, shown as badges: batches to check on Food intake, approved portions not yet on a trip. */
export type NavCounts = { pending: number; waiting: number };

/** Pages that sit outside any event (the overview and setup) have no event tabs. */
export const isOutsideEvent = (path: string) => path === "/" || path.startsWith("/setup");

/** Small count pill for a tab, or nothing when there is no waiting work. Orange: food to check. Sky blue: food to plan. */
export function TabBadge({ href, counts }: { href: string; counts: NavCounts }) {
  if (href === "/intake" && counts.pending > 0) {
    return (
      <span className="rounded-full bg-orange px-1.5 py-px font-mono text-[11px] font-semibold text-ink" aria-label={`${counts.pending} ${counts.pending === 1 ? "batch needs" : "batches need"} checking`}>
        {counts.pending}
      </span>
    );
  }
  if (href === "/match" && counts.waiting > 0) {
    return (
      <span className="rounded-full bg-sky px-1.5 py-px font-mono text-[11px] font-semibold text-ink" aria-label={`${counts.waiting} portions waiting`}>
        {counts.waiting}
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
