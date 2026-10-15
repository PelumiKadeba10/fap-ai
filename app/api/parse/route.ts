import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { parseMessage } from "@/lib/parse-message";

const Body = z.object({ message: z.string().trim().min(1).max(800) });

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to log food." }, { status: 401 });

  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Type a message first." }, { status: 400 });

  const result = await parseMessage(body.data.message);
  if (!result) {
    return NextResponse.json({ error: "Couldn't find a quantity in that message. Add the number of portions." }, { status: 422 });
  }
  return NextResponse.json(result);
}
