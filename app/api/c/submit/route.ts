import { NextResponse } from "next/server";
import { saveFoodReport } from "@/lib/submit-food";

/** Used by the collection page's offline queue. Same rules as the form; an `id` makes retries safe. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const r = await saveFoodReport(form, { queued: req.headers.get("x-queued") === "1" });
  return r.ok ? NextResponse.json({ id: r.id, photoSkipped: r.photoSkipped }) : NextResponse.json({ error: r.error }, { status: r.status });
}
