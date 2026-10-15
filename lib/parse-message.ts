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

export type PhotoInput = { data: Buffer; mediaType: string };

function prompt(message: string, withPhoto: boolean) {
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
 "notes": short string or ""}${withPhoto ? `

A photo of the food is attached. Use it only to identify or confirm the food type, the packaging and the condition (hot, covered, sealed).
Take the quantity ONLY from the message text; never estimate counts from the photo.
If the message and the photo disagree about the food type, keep the message's food and put a short note in "notes", e.g. "Photo looks like fried rice".` : ""}`;
}

async function parseWithClaude(message: string, image?: PhotoInput): Promise<ParsedRecord | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
    max_tokens: 400,
    messages: [{
      role: "user",
      content: [
        ...(image ? [{ type: "image" as const, source: { type: "base64" as const, media_type: image.mediaType as "image/jpeg" | "image/png" | "image/webp", data: image.data.toString("base64") } }] : []),
        { type: "text" as const, text: prompt(message, !!image) },
      ],
    }],
  });
  const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const parsed = Record.safeParse(JSON.parse(text.slice(start, end + 1)));
  return parsed.success ? parsed.data : null;
}

/**
 * Claude first (with the photo when given), then the offline parser, which ignores the photo.
 * If the photo makes the Claude call fail, it retries once with text only. Returns null when no quantity can be found.
 */
export async function parseMessage(text: string, image?: PhotoInput): Promise<{ record: ParsedRecord; parsedBy: "claude" | "local" } | null> {
  for (const img of image ? [image, undefined] : [undefined]) {
    try {
      const record = await parseWithClaude(text, img);
      if (record) return { record, parsedBy: "claude" };
      break;
    } catch (e) {
      console.error(img ? "Claude parse with photo failed" : "Claude parse failed, using offline parser", e);
    }
  }
  const record = parseLocal(text);
  return record ? { record, parsedBy: "local" } : null;
}
