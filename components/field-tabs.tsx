import Link from "next/link";

export type FieldTab = { href: string; label: string; on: boolean; badge?: number };

/** Big tab buttons at the top of a field link page, e.g. "My trip" and "Messages". */
export function FieldTabs({ tabs }: { tabs: FieldTab[] }) {
  return (
    <nav aria-label="Sections" className={`grid gap-2 ${tabs.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.on ? "page" : undefined} className={`flex min-h-14 items-center justify-center gap-1.5 rounded-xl border-2 border-ink px-2 text-center text-lg font-semibold ${t.on ? "bg-ink text-white" : "bg-white text-ink"}`}>
          {t.label}{!!t.badge && <span className="rounded-full bg-orange px-2 py-0.5 font-mono text-sm text-white">{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
