import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/supabase/server";
import { parseLocal } from "@/lib/parse-local";
import { fmtTime } from "@/lib/format";
import type { ParsedRecord } from "@/lib/types";

const Record = z.object({
  food: z.string().min(1).max(80),
  quantity: z.coerce.number().int().positive(),
  collected_time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().catch(null),
  location: z.string().max(60).catch("Convocation Centre"),
  condition: z.string().max(40).catch("Not stated"),
  category: z.enum(["cooked_meal", "bread_pastry", "fruit_veg", "packaged", "drinks"]).catch("cooked_meal"),
  notes: z.string().max(120).catch(""),
});

const Body = z.object({ message: z.string().trim().min(1).max(800) });

function prompt(message: string) {
  const now = fmtTime(new Date());
  return `You convert a food-rescue volunteer's chat message into one JSON record.
Context: surplus food recovery at Covenant University events, Ota, Nigeria. Current time in Lagos is ${now}.
Message: """${message}"""
Reply with only a JSON object with exactly these keys:
{"food": string (dish or item names, Title Case, e.g. "Jollof Rice + Chicken"),
 "quantity": integer (portions, packs, plates or items; if crates or cartons are given without an item count, count the containers),
 "collected_time": "HH:MM" in 24-hour time, or null if not stated ("8:15pm" -> "20:15"),
 "location": string (where it was collected; "Convocation Centre" if not stated),
 "condition": short string such as "Hot, packed" or "Sealed",
 "category": one of "cooked_meal","bread_pastry","fruit_veg","packaged","drinks" (the most perishable item's category),
 "notes": short string or ""}`;
}

async function parseWithClaude(message: string): Promise<ParsedRecord | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt(message) }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const parsed = Record.safeParse(JSON.parse(text.slice(start, end + 1)));
  return parsed.success ? parsed.data : null;
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Sign in to log food." }, { status: 401 });

  const body = Body.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Type a message first." }, { status: 400 });

  let record: ParsedRecord | null = null;
  let parsedBy: "claude" | "local" = "claude";
  try {
    record = await parseWithClaude(body.data.message);
  } catch (e) {
    console.error("Claude parse failed, using offline parser", e);
  }
  if (!record) {
    record = parseLocal(body.data.message);
    parsedBy = "local";
  }
  if (!record) {
    return NextResponse.json({ error: "Couldn't find a quantity in that message. Add the number of portions." }, { status: 422 });
  }
  return NextResponse.json({ record, parsedBy });
}
