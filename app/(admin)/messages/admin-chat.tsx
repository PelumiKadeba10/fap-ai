"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { createClient } from "@/lib/supabase/client";
import { fmtTime } from "@/lib/format";
import type { Channel, Message } from "@/lib/messages";
import { markThreadRead, sendMessage } from "../actions";
import { useToast } from "../toast";

/** One conversation with a bus lead or a collection point. New messages arrive live. */
export function AdminChat({ eventId, channel, threadId, name, initial }: { eventId: string; channel: Channel; threadId: string; name: string; initial: Message[] }) {
  const router = useRouter();
  const toast = useToast();
  const [messages, setMessages] = useState(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => setMessages(initial), [initial]);

  // Opening the conversation, or getting a new message while it is open, counts as reading it.
  const unread = messages.some((m) => m.sender === "field" && !m.read_at);
  useEffect(() => {
    if (unread) void markThreadRead(channel, threadId).then(() => router.refresh());
  }, [unread, channel, threadId, router]);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`messages-${threadId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `event_id=eq.${eventId}` }, (p) => {
        const m = p.new as Message;
        if (m.channel === channel && m.thread_id === threadId) setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
        else router.refresh();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [eventId, channel, threadId, router]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const r = await sendMessage(channel, threadId, body);
    setSending(false);
    if (!r.ok) return toast(false, r.error);
    setText("");
    router.refresh();
  }

  return (
    <div className="flex min-h-96 flex-col gap-3">
      {messages.length === 0
        ? <p className="py-10 text-center text-sm text-muted">No messages with {name} yet. Write the first one below.</p>
        : <ul ref={list} aria-live="polite" aria-label={`Messages with ${name}`} className="flex max-h-[28rem] flex-1 flex-col gap-2 overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className={`max-w-[80%] rounded-2xl px-3.5 py-2 ${m.sender === "admin" ? "self-end bg-ink text-white" : "self-start bg-soft text-ink"}`}>
              <p className="break-words whitespace-pre-wrap text-[15px]">{m.body}</p>
              <p className={`font-mono text-[11px] ${m.sender === "admin" ? "text-white/70" : "text-muted"}`}>{m.sender === "admin" ? "You" : name} · {fmtTime(m.created_at)}{m.sender === "admin" && m.read_at ? " · seen" : ""}</p>
            </li>
          ))}
        </ul>}
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line pt-3">
        <label htmlFor="admin-chat-text" className="sr-only">Message to {name}</label>
        <textarea id="admin-chat-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={2} placeholder={`Message ${name}`} className="input min-h-11 flex-1" />
        <button className="btn-dark min-h-11" disabled={sending || !text.trim()} aria-busy={sending}>
          {sending ? <Spinner /> : <Send className="size-4" aria-hidden />}{sending ? "Sending…" : "Send"}
        </button>
      </form>
    </div>
  );
}
