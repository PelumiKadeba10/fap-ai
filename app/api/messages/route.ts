import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanBody, isFieldChannel, listThread, resolveThread } from "@/lib/messages";

const NO_STORE = { "Cache-Control": "no-store" };

/** Field side of the chat. The secret token in the link is the only credential, as on the other field pages. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const channel = u.searchParams.get("channel");
  const db = createAdminClient();
  const thread = isFieldChannel(channel) ? await resolveThread(db, channel, u.searchParams.get("token") ?? "") : null;
  if (!thread) return NextResponse.json({ error: "This link isn’t valid." }, { status: 404, headers: NO_STORE });
  // Opening the chat counts as reading what the coordinator sent.
  await db.from("messages").update({ read_at: new Date().toISOString() }).eq("channel", thread.channel).eq("thread_id", thread.threadId).eq("sender", "admin").is("read_at", null);
  return NextResponse.json({ messages: await listThread(db, thread.channel, thread.threadId) }, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { channel?: string; token?: string; body?: string } | null;
  const db = createAdminClient();
  const thread = isFieldChannel(b?.channel) ? await resolveThread(db, b.channel, String(b?.token ?? "")) : null;
  if (!thread) return NextResponse.json({ error: "This link isn’t valid." }, { status: 404 });
  const body = cleanBody(b?.body);
  if (!body) return NextResponse.json({ error: "Write a message of up to 1000 characters." }, { status: 400 });
  const { error } = await db.from("messages").insert({ event_id: thread.eventId, channel: thread.channel, thread_id: thread.threadId, sender: "field", body });
  if (error) return NextResponse.json({ error: "Couldn’t send that message. Try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
