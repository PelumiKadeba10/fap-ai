import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { getEventOverview, type EventOverview } from "@/lib/data";
import { EVENT_TYPES, predict } from "@/lib/predict";
import { TZ, n0 } from "@/lib/format";
import { eventPhase, type EventPhase } from "@/lib/overview";
import { openEvent } from "./actions";
import { EmptyState, PageHeader, Pill } from "./ui";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-NG", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

const NewEvent = () => (
  <Link href="/event?new=1" className="btn-dark"><CalendarPlus className="size-4" aria-hidden />New event</Link>
);

/** Landing page: every event, grouped by when it happens. Opening one selects it for the other pages. */
export default async function OverviewPage() {
  const all = await getEventOverview();
  const now = new Date();
  const groups: Record<EventPhase, EventOverview[]> = { live: [], upcoming: [], past: [] };
  for (const o of all) groups[eventPhase(o.event, now)].push(o);
  groups.upcoming.reverse(); // soonest first

  return (
    <>
      <PageHeader title="Events" description="Pick an event to work on it. Each event keeps its own food, trips and report." actions={all.length > 0 ? <NewEvent /> : undefined} />
      {all.length === 0 ? (
        <EmptyState action={<NewEvent />}>No events yet.</EmptyState>
      ) : (
        <>
          <Group title="Live now" items={groups.live} phase="live" />
          <Group title="Upcoming" items={groups.upcoming} phase="upcoming" />
          <Group title="Past" items={groups.past} phase="past" />
        </>
      )}
    </>
  );
}

function Group({ title, items, phase }: { title: string; items: EventOverview[]; phase: EventPhase }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <h2 className="h2 flex items-center gap-2.5">{title}<span className="font-mono text-[13px] font-normal text-muted">{items.length}</span></h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {items.map((o) => <EventCard key={o.event.id} o={o} phase={phase} />)}
      </ul>
    </section>
  );
}

function EventCard({ o, phase }: { o: EventOverview; phase: EventPhase }) {
  const { event: e } = o;
  return (
    <li>
      <form action={openEvent}>
        <input type="hidden" name="id" value={e.id} />
        <input type="hidden" name="to" value={phase === "live" ? "/live" : "/event"} />
        <button className="group block w-full rounded-xl border border-line p-4 text-left transition-colors hover:border-[#b9c1c9] hover:bg-soft sm:p-5">
          <span className="flex items-start justify-between gap-3">
            <span className="min-w-0">
              <span className="block truncate text-base font-semibold">{e.name}</span>
              <span className="mt-0.5 block text-[13px] text-muted">{EVENT_TYPES[e.type].label}</span>
            </span>
            {phase === "live" && <Pill tone="green">Live now</Pill>}
          </span>
          <span className="mt-1 block font-mono text-[13px] text-muted">{when.format(new Date(e.starts_at))}</span>
          <span className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3.5">
            <Figure label="Predicted surplus" value={n0(predict(e).surplus)} />
            <Figure label="Recovered" value={n0(o.recovered)} />
            <Figure label="Delivered" value={n0(o.delivered)} />
          </span>
        </button>
      </form>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="block">
      <span className="block text-xs text-muted">{label}</span>
      <span className="mt-0.5 block font-mono text-xl font-semibold tabular-nums">{value}</span>
    </span>
  );
}
