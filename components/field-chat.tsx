"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { Spinner } from "@/components/spinner";
import type { FieldChannel, Message } from "@/lib/messages";
import { fmtTime } from "@/lib/format";

/** Message box for the field pages (bus link, food intake link): talk to the coordinators at the admin panel. */
export function FieldChat({ channel, token }: { channel: FieldChannel; token: string }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const url = `/api/messages?channel=${channel}&token=${token}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) setMessages(((await res.json()) as { messages: Message[] }).messages);
    } catch { /* offline: keep what is shown */ }
  }, [url]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 8000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ channel, token, body }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error);
      setText("");
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn’t send. Check your connection and try again.");
    } finally { setSending(false); }
  }

  return (
    <section aria-labelledby="chat-title" className="flex flex-col gap-3 rounded-2xl border-2 border-ink p-4">
      <h2 id="chat-title" className="flex items-center gap-2 text-xl font-semibold"><MessageSquare className="size-5" aria-hidden />Message the coordinator</h2>
      {messages === null ? <p className="flex items-center gap-2 text-base text-[#4a525c]"><Spinner />Loading messages…</p>
        : messages.length === 0 ? <p className="text-base text-[#4a525c]">No messages yet. Write below if you need help.</p>
        : <ul ref={list} aria-live="polite" className="flex max-h-72 flex-col gap-2 overflow-y-auto">
          {messages.map((m) => (
            <li key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 ${m.sender === "field" ? "self-end bg-ink text-white" : "self-start bg-soft text-ink"}`}>
              <p className="break-words whitespace-pre-wrap text-base">{m.body}</p>
              <p className={`font-mono text-xs ${m.sender === "field" ? "text-white/70" : "text-[#4a525c]"}`}>{m.sender === "field" ? "You" : "Coordinator"} · {fmtTime(m.created_at)}</p>
            </li>
          ))}
        </ul>}
      {error && <p role="alert" className="text-base font-medium text-crit">{error}</p>}
      <form onSubmit={send} className="flex flex-col gap-2">
        <label htmlFor="chat-text" className="sr-only">Your message</label>
        <textarea id="chat-text" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} rows={2} placeholder="Type your message" className="w-full rounded-xl border-2 border-ink bg-white px-3 py-2 text-lg text-ink" />
        <button disabled={sending || !text.trim()} aria-busy={sending} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 text-lg font-semibold text-white disabled:opacity-60">
          {sending ? <Spinner /> : <Send className="size-5" aria-hidden />}{sending ? "Sending…" : "Send message"}
        </button>
      </form>
    </section>
  );
}
