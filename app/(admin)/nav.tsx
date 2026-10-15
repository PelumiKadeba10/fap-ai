"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, Map, Radio, FileBarChart } from "lucide-react";

export const TABS = [
  ["/event", "Event & surplus", CalendarDays],
  ["/intake", "Food intake", ClipboardList],
  ["/match", "Match & route", Map],
  ["/live", "Live dispatch", Radio],
  ["/impact", "Impact report", FileBarChart],
] as const;

/** Small count next to a tab, e.g. portions of food waiting for matching. */
export function WaitingBadge({ n }: { n: number }) {
  return <span className="rounded-full bg-orange px-1.5 py-px font-mono text-[11px] font-semibold text-ink" aria-label={`${n} portions waiting`}>{n}</span>;
}

export function Nav({ badges = {} }: { badges?: Record<string, number> }) {
  const path = usePathname();
  const active = useRef<HTMLAnchorElement>(null);

  // On phones the tab strip scrolls sideways; keep the current tab in view.
  useEffect(() => {
    active.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [path]);

  return (
    <nav aria-label="Sections" className="no-print hidden md:flex -mx-4 mt-1 gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:gap-2 sm:px-0 [scrollbar-width:none]">
      {TABS.map(([href, label, Icon], i) => {
        const on = path.startsWith(href);
        return (
          <Link
            key={href}
            ref={on ? active : undefined}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`-mb-px flex flex-none items-center gap-2 border-b-2 px-2.5 pt-3.5 pb-3 text-sm font-medium transition-colors ${on ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
          >
            <span className={`font-mono text-xs ${on ? "text-blue" : "text-[#8a929c]"}`}>0{i + 1}</span>
            <Icon className="size-4" aria-hidden />
            {label}
            {!!badges[href] && <WaitingBadge n={badges[href]} />}
          </Link>
        );
      })}
    </nav>
  );
}
