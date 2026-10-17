import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clock, Flame, Minus, Truck, Package, type LucideIcon } from "lucide-react";
import type { DeliveryStatus } from "@/lib/types";
import type { UrgencyLevel } from "@/lib/urgency";
import { STATUS } from "@/lib/status";

const TONE_TEXT = { muted: "text-muted", blue: "text-blue", orange: "text-warn", red: "text-crit", green: "text-ok" } as const;
const TONE_BG = { muted: "bg-soft", blue: "bg-[#eaf5fd]", orange: "bg-[#fbf3e2]", red: "bg-[#fcecea]", green: "bg-[#e9f6ee]" } as const;
export type Tone = keyof typeof TONE_TEXT;

const PILL = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap";

/** Coloured pill that always carries an icon and a word, never colour alone. */
export function Pill({ tone, icon: Icon, children }: { tone: Tone; icon?: LucideIcon; children: ReactNode }) {
  return <span className={`${PILL} ${TONE_TEXT[tone]} ${TONE_BG[tone]}`}>{Icon && <Icon className="size-3.5" aria-hidden />}{children}</span>;
}

export function UrgencyPill({ level, score }: { level: UrgencyLevel; score?: number }) {
  const [tone, label, icon] = level === "high" ? (["red", "High", Flame] as const) : level === "med" ? (["orange", "Medium", AlertTriangle] as const) : (["green", "Low", CheckCircle2] as const);
  return <Pill tone={tone} icon={icon}>{label} urgency{score != null && <span className="font-mono text-xs">{score}</span>}</Pill>;
}

const STATUS_ICON: Record<DeliveryStatus, LucideIcon> = { assigned: Clock, picked_up: Package, on_the_way: Truck, delayed: AlertTriangle, delivered: CheckCircle2 };

export function StatusPill({ status }: { status: DeliveryStatus }) {
  const s = STATUS[status];
  return <Pill tone={s.tone} icon={STATUS_ICON[status]}>{s.label}</Pill>;
}

/** Small neutral badge, e.g. who parsed a message. */
export function Badge({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-xs font-medium text-muted">{Icon && <Icon className="size-3" aria-hidden />}{children}</span>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="h1">{title}</h1>
        {description && <p className="lede">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="border-t border-line pt-3.5">
      <p className="stat-k">{label}</p>
      <p className={`stat-v mt-1.5 ${tone ? TONE_TEXT[tone] : ""}`}>{value}</p>
      {hint && <p className="stat-s mt-1.5">{hint}</p>}
    </div>
  );
}

export function EmptyState({ icon: Icon = Minus, children, action }: { icon?: LucideIcon; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <Icon className="size-6 text-[#b3bac2]" aria-hidden />
      <p className="max-w-[46ch]">{children}</p>
      {action && <div className="mt-1 text-sm font-medium text-ink [&_a]:underline [&_a]:underline-offset-4">{action}</div>}
    </div>
  );
}

export function SectionHead({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="h2">{title}</h2>
      {aside && <span className="text-[13px] text-muted">{aside}</span>}
    </div>
  );
}

/** On phones, tables become stacked cards: each <td> shows its column name from data-label. */
export const cardTable = "max-md:[&_thead]:hidden max-md:[&_tr]:grid max-md:[&_tr]:grid-cols-2 max-md:[&_tr]:gap-x-3.5 max-md:[&_tr]:gap-y-2.5 max-md:[&_tr]:border-b max-md:[&_tr]:border-line max-md:[&_tr]:py-3.5 max-md:[&_td]:block max-md:[&_td]:border-0 max-md:[&_td]:p-0 max-md:[&_td]:before:block max-md:[&_td]:before:text-[12px] max-md:[&_td]:before:text-muted max-md:[&_td]:before:content-[attr(data-label)] max-md:[&_td:last-child]:col-span-2 w-full border-collapse text-[15px]";

const ACCENT = {
  ink: "bg-ink text-white",
  blue: "bg-blue text-white",
  orange: "bg-orange text-ink",
  green: "bg-ok text-white",
  red: "bg-crit text-white",
} as const;
export type Accent = keyof typeof ACCENT;

/**
 * A page section as its own card: coloured icon chip, title, optional count and note in a tinted header,
 * content below. `id` makes it a jump target (the Setup section links).
 */
export function SectionCard({ id, title, icon: Icon, accent = "ink", count, badge, aside, children }: {
  id?: string; title: string; icon: LucideIcon; accent?: Accent; count?: number | string; badge?: ReactNode; aside?: ReactNode; children: ReactNode;
}) {
  const hid = id ? id + "-title" : undefined;
  return (
    <section id={id} aria-labelledby={hid} className="min-w-0 scroll-mt-32 overflow-hidden rounded-2xl border border-[#dde2e7] bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-line bg-soft px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${ACCENT[accent]}`}><Icon className="size-4" aria-hidden /></span>
          <h2 id={hid} className="h2 break-words">{title}</h2>
          {count !== undefined && <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs font-medium ring-1 ring-line">{count}</span>}
          {badge}
        </div>
        {aside && <span className="text-[13px] text-muted">{aside}</span>}
      </header>
      <div className="flex min-w-0 flex-col gap-4 overflow-x-auto p-4 sm:p-5">{children}</div>
    </section>
  );
}
