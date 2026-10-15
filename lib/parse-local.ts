import type { ParsedRecord } from "./types";
import { guessCategory } from "./urgency";

/**
 * Offline parser for volunteer messages, used when the Claude API is unavailable.
 * Finds the first number (quantity), a time like "8:15pm", a place after at/by/from/near,
 * and guesses the food category from keywords.
 */
export function parseLocal(raw: string): ParsedRecord | null {
  const t = raw.replace(/,(?=\d{3})/g, "");
  const qm = /(\d+)\s*(packs?|portions?|plates?|pieces?|loaves|bottles?|crates?|cartons?|trays?|coolers?)?/i.exec(t);
  if (!qm) return null;

  let collected_time: string | null = null;
  const tm = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i.exec(t);
  if (tm) {
    let h = Number(tm[1]) % 12;
    if (/pm/i.test(tm[3])) h += 12;
    collected_time = `${String(h).padStart(2, "0")}:${tm[2] ?? "00"}`;
  }

  let location = "Convocation Centre";
  const lm = /\b(?:at|by|from|near)\s+(?:the\s+)?([a-z][a-z' ]{2,40}?)(?=,|\.|$|\s+(?:still|collected|packed|now|around|by|at)\b|\s+\d)/i.exec(t);
  if (lm) location = lm[1].trim().replace(/\b\w/g, (c) => c.toUpperCase());

  let food = t.slice(qm.index + qm[0].length).replace(/^\s*(of|x)\s+/i, "");
  food = food.split(/,|\bat\b|\bby\b|\bpacked\b|\bcollected\b|\bstill\b|\d{1,2}(:\d{2})?\s*(am|pm)/i)[0].replace(/\babout\b/gi, "").trim();
  if (!food) food = "Mixed food";
  food = food.replace(/\band\b/gi, "+").replace(/\s+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const cond = /hot/i.test(t) ? "Hot" : /warm/i.test(t) ? "Warm" : /cold|chilled/i.test(t) ? "Chilled" : /sealed/i.test(t) ? "Sealed" : "Not stated";

  return {
    food: food.slice(0, 80),
    quantity: Number(qm[1]),
    collected_time,
    location,
    condition: cond + (/packed/i.test(t) ? ", packed" : ""),
    category: guessCategory(t),
    notes: "",
  };
}
