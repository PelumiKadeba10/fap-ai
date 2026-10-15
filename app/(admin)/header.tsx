"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, CalendarRange, LogOut, Menu, Settings, Shuffle, X, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/submit-button";
import { signOut } from "./actions";
import { Clock } from "./clock";
import { TABS, TabBadge, isOutsideEvent, type NavCounts } from "./nav";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const REFRESH_EVERY_MS = 3000;

function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex shrink-0 items-center gap-2.5 ${className}`} aria-label="FAP AI, all events">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/fap-logo.png" alt="" className="h-7 w-auto" />
      <b className="text-base max-[380px]:hidden">FAP <span className="text-blue">AI</span></b>
    </Link>
  );
}

export function Header({ eventId, eventName, counts }: { eventId: string | null; eventName: string | null; counts: NavCounts }) {
  const path = usePathname();
  const router = useRouter();
  const outside = isOutsideEvent(path); // overview and setup aren't inside an event
  const setup = path.startsWith("/setup");
  const [open, setOpen] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const tab = TABS.find(([href]) => path.startsWith(href));
  const waiting = counts.pending > 0 || counts.waiting > 0;

  // Close the menu whenever the route changes.
  useEffect(() => { setOpen(false); }, [path]);

  // Keep the badges fresh: any change to this event's batches or deliveries refreshes the page data, at most once every 3 seconds.
  useEffect(() => {
    if (!eventId || outside) return;
    const supabase = createClient();
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => { timer = null; last = Date.now(); router.refresh(); };
    const onChange = () => { if (!timer) timer = setTimeout(fire, Math.max(0, last + REFRESH_EVERY_MS - Date.now())); };
    const ch = supabase
      .channel(`badges-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "batches", filter: `event_id=eq.${eventId}` }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries", filter: `event_id=eq.${eventId}` }, onChange)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [eventId, outside, router]);

  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-4 py-2.5 sm:px-6">
          <Logo />

          {/* Desktop */}
          {!outside && (
            <>
              <Link href="/" className="hidden items-center gap-1.5 text-sm text-muted hover:text-ink md:flex"><ArrowLeft className="size-4" aria-hidden />All events</Link>
              <span className="hidden max-w-[24rem] min-w-0 truncate rounded-full bg-soft px-3 py-1 text-sm font-medium md:block" title={eventName ?? undefined}>{eventName ?? "No event selected"}</span>
            </>
          )}
          {setup && <Link href="/" className="hidden items-center gap-1.5 text-sm text-muted hover:text-ink md:flex"><ArrowLeft className="size-4" aria-hidden />All events</Link>}
          <span className="hidden flex-1 md:block" />
          {!setup && <Link href="/setup" className="hidden items-center gap-1.5 text-sm text-muted hover:text-ink md:flex"><Settings className="size-4" aria-hidden />Setup</Link>}
          <span className="hidden md:block"><Clock /></span>
          <form action={signOut} className="hidden md:block"><SubmitButton className="link" pendingText="Signing out…">Sign out</SubmitButton></form>

          {/* Phone */}
          <div className="min-w-0 flex-1 md:hidden">
            {outside ? (
              <p className="truncate text-sm font-semibold">{setup ? "Setup" : "Events"}</p>
            ) : (
              <>
                <p className="truncate text-sm leading-tight font-semibold">{eventName ?? "No event selected"}</p>
                <p className="truncate text-xs leading-tight text-muted">{tab ? tab[1] : "FAP AI"}</p>
              </>
            )}
          </div>
          <button
            ref={menuBtn} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="mobile-menu" aria-label="Open menu"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#dde2e7] bg-white hover:bg-soft md:hidden"
            onClick={() => setOpen(true)}
          >
            <Menu className="size-5" aria-hidden />
            {!outside && waiting && <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-white bg-orange" aria-hidden />}
          </button>
        </div>
      </header>

      {open && <Sidebar outside={outside} eventName={eventName} counts={counts} path={path} onClose={() => setOpen(false)} returnFocus={menuBtn} />}
    </>
  );
}

function NavItem({ href, label, Icon, on, badge }: { href: string; label: string; Icon: LucideIcon; on: boolean; badge?: React.ReactNode }) {
  return (
    <Link
      href={href} aria-current={on ? "page" : undefined}
      className={`flex min-h-12 items-center gap-3 rounded-lg px-2.5 text-[15px] font-medium ${on ? "bg-soft text-ink" : "text-muted hover:bg-soft hover:text-ink"}`}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="flex-1">{label}</span>
      {badge}
      {on && <span className="size-2 rounded-full bg-ink" aria-hidden />}
    </Link>
  );
}

/** Phone menu: slides in from the left over a dark overlay, with focus trapped inside while it is open. */
function Sidebar({ outside, eventName, counts, path, onClose, returnFocus }: {
  outside: boolean; eventName: string | null; counts: NavCounts; path: string; onClose: () => void; returnFocus: React.RefObject<HTMLButtonElement | null>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const button = returnFocus.current;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // lock page scroll behind the menu
    closeBtn.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      button?.focus();
    };
  }, [returnFocus]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return onClose();
    if (e.key !== "Tab") return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <div className="no-print fixed inset-0 z-50 md:hidden" onKeyDown={onKeyDown}>
      <div className="fade-in absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div ref={panel} id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className="slide-in-left absolute inset-y-0 left-0 flex w-[min(85vw,320px)] flex-col overflow-y-auto bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <Logo />
          <button ref={closeBtn} type="button" onClick={onClose} aria-label="Close menu" className="flex size-10 items-center justify-center rounded-lg border border-[#dde2e7] hover:bg-soft">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {outside ? (
          <nav aria-label="Menu" className="flex flex-col px-2 py-2">
            <NavItem href="/" label="Events" Icon={CalendarRange} on={path === "/"} />
            <NavItem href="/setup" label="Setup: places & buses" Icon={Settings} on={path.startsWith("/setup")} />
          </nav>
        ) : (
          <>
            <div className="border-b border-line px-4 py-4">
              <p className="text-xs text-muted">Current event</p>
              <p className="mt-0.5 text-base leading-snug font-semibold break-words">{eventName ?? "No event selected"}</p>
              <Link href="/" className="mt-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-blue underline underline-offset-4"><Shuffle className="size-4" aria-hidden />Change event</Link>
            </div>
            <nav aria-label="Sections" className="flex flex-col px-2 py-2">
              {TABS.map(([href, label, Icon]) => (
                <NavItem key={href} href={href} label={label} Icon={Icon} on={path.startsWith(href)} badge={<TabBadge href={href} counts={counts} />} />
              ))}
            </nav>
            <div className="border-t border-line px-2 py-2">
              <NavItem href="/setup" label="Setup: places & buses" Icon={Settings} on={false} />
            </div>
          </>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Clock />
          <form action={signOut}>
            <SubmitButton className="btn-line" pendingText="Signing out…"><LogOut className="size-4" aria-hidden />Sign out</SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
