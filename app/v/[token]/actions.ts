"use server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyStatus } from "@/lib/apply-status";
import type { DeliveryStatus } from "@/lib/types";

const STATUSES: DeliveryStatus[] = ["assigned", "picked_up", "on_the_way", "delayed", "delivered"];

/** Volunteer taps a status button. Works without JavaScript (plain form post), which helps on weak phones. */
export async function updateMyDelivery(form: FormData) {
  const token = String(form.get("token") ?? "");
  const from = String(form.get("from") ?? "") as DeliveryStatus;
  const to = String(form.get("to") ?? "") as DeliveryStatus;
  if (!/^[a-f0-9]{32}$/.test(token) || !STATUSES.includes(from) || !STATUSES.includes(to)) redirect(`/v/${token}`);

  const db = createAdminClient();
  const { data } = await db.from("deliveries").select("id").eq("token", token).maybeSingle();
  if (!data) redirect(`/v/${token}`);

  const r = await applyStatus(db, data.id, from, to, "Sent by volunteer");
  redirect(r.ok ? `/v/${token}` : `/v/${token}?e=${encodeURIComponent(r.error)}`);
}
