import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyBusTap } from "@/lib/bus-act";

const Body = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
  intent: z.string().max(20),
  trip: z.string().max(40).optional(),
  stop: z.coerce.number().int().optional(),
  loaded: z.coerce.number().int().optional(),
  at: z.string().max(40).optional(),
});

/** Bus lead taps sent by the page's offline queue. A tap that already took effect answers ok, so retries are safe. */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const r = await applyBusTap(createAdminClient(), body.data);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.notFound ? 404 : 409 });
}
