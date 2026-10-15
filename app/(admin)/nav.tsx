"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/event", "Event & surplus"],
  ["/intake", "Food intake"],
  ["/match", "Match & route"],
  ["/live", "Live dispatch"],
  ["/impact", "Impact report"],
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="mt-2 flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {TABS.map(([href, label], i) => {
        const on = path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`-mb-px flex flex-none gap-1.5 border-b-2 pt-3.5 pb-3 text-sm font-medium ${on ? "border-ink text-ink" : "border-transparent text-muted"}`}
          >
            <span className={`font-mono text-xs ${on ? "text-sky" : "text-[#b3bac2]"}`}>0{i + 1}</span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
