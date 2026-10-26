import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyPickupTap } from "@/lib/pickup-act";

const Body = z.object({
  token: z.string().regex(/^[a-f0-9]{32}$/),
  intent: z.string().max(20),
  pledge: z.string().max(40),
  packs: z.coerce.number().optional(),
  note: z.string().max(300).optional(),
  at: z.string().max(40).optional(),
});

/** Pick-up taps sent by the collection page's offline queue. A tap that already took effect answers ok, so retries are safe. */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const r = await applyPickupTap(createAdminClient(), body.data);
  if (r.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: r.error }, { status: r.notFound ? 404 : 409 });
}
