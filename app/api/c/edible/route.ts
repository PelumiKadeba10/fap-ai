import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveEdibleCount } from "@/lib/count-actions";
export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { token?: string; edible?: number; at?: string } | null;
  const r = await saveEdibleCount(createAdminClient(), String(body?.token ?? ""), Number(body?.edible), body?.at);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.notFound ? 404 : 409 });
}
