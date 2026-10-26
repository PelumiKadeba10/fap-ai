import Link from "next/link";
import { Bus, Inbox, MessageSquare } from "lucide-react";
import { getActiveEvent, getThreadMessages, getThreads, type ThreadSummary } from "@/lib/data";
import { isChannel } from "@/lib/messages";
import { fmtTime } from "@/lib/format";
import { EmptyState, PageHeader, SectionCard } from "../ui";
import { AdminChat } from "./admin-chat";

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const event = await getActiveEvent();
  if (!event) return <EmptyState action={<Link href="/event?new=1">Create an event</Link>}>Create the event first.</EmptyState>;
  const { t } = await searchParams;
  const threads = await getThreads(event.id);
  const [channel, id] = (t ?? "").split(":");
  const open = isChannel(channel) ? threads.find((x) => x.channel === channel && x.threadId === id) ?? null : null;
  const messages = open ? await getThreadMessages(open.channel, open.threadId) : [];
  const buses = threads.filter((x) => x.channel === "bus");
  const points = threads.filter((x) => x.channel === "intake");

  return (
    <>
      <PageHeader title="Messages." description="Talk to bus leads and to the people at each collection point. They write from the link you sent them." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        <div className="flex flex-col gap-6">
          <ThreadList title="Bus leads" icon={Bus} threads={buses} openKey={open && key(open)} empty="No buses yet. Add one in Setup." />
          <ThreadList title="Collection points" icon={Inbox} threads={points} openKey={open && key(open)} empty="No active collection points yet." />
        </div>
        {open ? (
          <SectionCard id="conversation" title={open.name} icon={open.channel === "bus" ? Bus : Inbox} accent={open.channel === "bus" ? "blue" : "orange"} aside={open.channel === "bus" ? "Bus lead" : "Food intake link"}>
            <AdminChat key={key(open)} eventId={event.id} channel={open.channel} threadId={open.threadId} name={open.name} initial={messages} />
          </SectionCard>
        ) : (
          <EmptyState icon={MessageSquare}>Choose a bus or a collection point to read and send messages.</EmptyState>
        )}
      </div>
    </>
  );
}

const key = (x: ThreadSummary) => `${x.channel}:${x.threadId}`;

function ThreadList({ title, icon, threads, openKey, empty }: { title: string; icon: typeof Bus; threads: ThreadSummary[]; openKey: string | null; empty: string }) {
  return (
    <SectionCard title={title} icon={icon} accent="ink" count={threads.length}>
      {threads.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="-my-2 flex flex-col">
          {threads.map((x) => (
            <li key={key(x)} className="border-t border-line first:border-t-0">
              <Link href={`/messages?t=${key(x)}`} aria-current={openKey === key(x) ? "page" : undefined} className={`flex min-h-11 items-start justify-between gap-3 rounded-lg px-2 py-2.5 hover:bg-soft ${openKey === key(x) ? "bg-soft" : ""}`}>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{x.name}</span>
                  <span className="block truncate text-[13px] text-muted">{x.last ? `${x.last.sender === "admin" ? "You: " : ""}${x.last.body}` : "No messages yet"}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  {x.last && <span className="font-mono text-[11px] text-muted">{fmtTime(x.last.created_at)}</span>}
                  {x.unread > 0 && <span className="rounded-full bg-crit px-1.5 py-px font-mono text-[11px] font-semibold text-white" aria-label={`${x.unread} unread`}>{x.unread}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
