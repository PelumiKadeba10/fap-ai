// SERVER ONLY: calls the Claude API with a secret key. Do not import from a "use client" file.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { parseLocal } from "./parse-local";
import { fmtTime } from "./format";
import type { ParsedRecord } from "./types";

const Record = z.object({
  food: z.string().min(1).max(80),
  quantity: z.coerce.number().int().positive(),
  collected_time: z.string().regex(/^\d{1,2}:\d{2}$/).nullable().catch(null),
  location: z.string().max(60).catch("Convocation Centre"),
  condition: z.string().max(40).catch("Not stated"),
  category: z.enum(["cooked_meal", "bread_pastry", "fruit_veg", "packaged", "drinks"]).catch("cooked_meal"),
  notes: z.string().max(120).catch(""),
});

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

/** Claude first, then the offline parser. Returns null when no quantity can be found. */
export async function parseMessage(text: string): Promise<{ record: ParsedRecord; parsedBy: "claude" | "local" } | null> {
  try {
    const record = await parseWithClaude(text);
    if (record) return { record, parsedBy: "claude" };
  } catch (e) {
    console.error("Claude parse failed, using offline parser", e);
  }
  const record = parseLocal(text);
  return record ? { record, parsedBy: "local" } : null;
}
