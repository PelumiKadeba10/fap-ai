"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { EventSummary } from "@/lib/data";
import { TZ } from "@/lib/format";
import { selectEvent, signOut } from "./actions";
import { Clock } from "./clock";
import { TABS, WaitingBadge } from "./nav";
import { useToast } from "./toast";

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const NEW = "__new";

function EventSwitcher({ id, events, currentId, className = "" }: { id: string; events: EventSummary[]; currentId: string | null; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onChange(v: string) {
    if (v === NEW) return router.push("/event?new=1");
    setPicked(v);
    start(async () => {
      const r = await selectEvent(v);
      if (!r.ok) toast(false, r.error);
      router.refresh();
      setPicked(null);
    });
  }

  return (
    <select
      id={id}
      aria-label="Event"
      className={`input max-w-full py-1.5 font-medium ${pending ? "pointer-events-none opacity-50" : ""} ${className}`}
      value={picked ?? currentId ?? ""}
      disabled={pending}
      onChange={(e) => onChange(e.target.value)}
    >
      {!currentId && <option value="" disabled>No event yet</option>}
      {events.map((e) => <option key={e.id} value={e.id}>{e.name} · {dateFmt.format(new Date(e.starts_at))}</option>)}
      <option value={NEW}>+ New event…</option>
    </select>
  );
}

export function Header({ events, currentId, badges = {} }: { events: EventSummary[]; currentId: string | null; badges?: Record<string, number> }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const current = events.find((e) => e.id === currentId);
  const tab = TABS.find(([href]) => path.startsWith(href));

  // Close the menu whenever the route changes, or on Escape.
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="no-print sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link href="/event" className="flex shrink-0 items-center gap-2.5" aria-label="FAP AI home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fap-logo.png" alt="" className="h-7 w-auto" />
          <b className="text-base max-[380px]:hidden">FAP <span className="text-blue">AI</span></b>
        </Link>

        {/* Desktop */}
        <EventSwitcher id="event-switch" events={events} currentId={currentId} className="hidden w-auto max-w-[22rem] min-w-0 md:block" />
        <span className="hidden flex-1 md:block" />
        <span className="hidden md:block"><Clock /></span>
        <form action={signOut} className="hidden md:block">
          <button className="link">Sign out</button>
        </form>

        {/* Phone */}
        <div className="min-w-0 flex-1 md:hidden">
          <p className="truncate text-sm leading-tight font-semibold">{current?.name ?? "No event yet"}</p>
          <p className="truncate text-xs leading-tight text-muted">{tab ? tab[1] : "FAP AI"}</p>
        </div>
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#dde2e7] bg-white hover:bg-soft md:hidden"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </div>

      {open && (
        <div id="mobile-menu" className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-line bg-white px-4 pt-4 pb-5 md:hidden">
          <label htmlFor="event-switch-m" className="label">Event</label>
          <EventSwitcher id="event-switch-m" events={events} currentId={currentId} className="mt-1.5 w-full" />
          <nav aria-label="Sections" className="mt-4 flex flex-col border-t border-line">
            {TABS.map(([href, label, Icon], i) => {
              const on = path.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 border-b border-line px-1 text-[15px] font-medium ${on ? "text-ink" : "text-muted"}`}
                >
                  <span className={`font-mono text-xs ${on ? "text-blue" : "text-[#8a929c]"}`}>0{i + 1}</span>
                  <Icon className="size-4" aria-hidden />
                  <span className="flex-1">{label}</span>
                  {!!badges[href] && <WaitingBadge n={badges[href]} />}
                  {on && <span className="size-2 rounded-full bg-ink" aria-hidden />}
                </Link>
              );
            })}
          </nav>
          <div className="mt-4 flex items-center justify-between">
            <Clock />
            <form action={signOut}>
              <button className="btn-line">Sign out</button>
            </form>
          </div>
        </div>
      )}
    </header>
  );
}
