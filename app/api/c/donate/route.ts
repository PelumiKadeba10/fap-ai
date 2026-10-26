import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { saveDonation } from "@/lib/donation-act";

const Body = z.object({ token: z.string().regex(/^[a-f0-9]{32}$/), packs: z.coerce.number(), dropper: z.string().max(120).optional(), id: z.string().uuid().optional(), at: z.string().max(40).optional() });

// Lightweight reachability check used by the donation form's offline banner.
export async function GET() {
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const result = await saveDonation(createAdminClient(), body.data);
  if (result.ok) return NextResponse.json({ ok: true });
  return NextResponse.json({ error: result.error }, { status: result.notFound ? 404 : 400 });
}
