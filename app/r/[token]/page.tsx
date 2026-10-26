import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtTime } from "@/lib/format";
import { ReportForm } from "@/app/c/[token]/report-form";
import { FieldChat } from "@/components/field-chat";
import { FieldTabs } from "@/components/field-tabs";
import { unreadFromAdmin } from "@/lib/messages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report food · FAP AI", robots: { index: false }, manifest: "/manifest.webmanifest" };

type Point = { id: string; name: string; location_note: string | null; active: boolean; events: { name: string; packs_per_carton: number | null } | null };
type Sub = { id: string; food: string; qty: number; edible_packs: number | null; notes: string | null; review_status: "pending" | "approved"; photo_path: string | null; created_at: string };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function ReportFoodPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string; ok?: string; photo?: string; tab?: string }> }) {
  const { token } = await params;
  const { e, ok, photo, tab } = await searchParams;
  const messagesTab = tab === "messages";
  const db = createAdminClient();
  let cp: Point | null = null;
  if (/^[a-f0-9]{32}$/.test(token)) {
    const lookup = await db.from("collection_points").select("id, name, location_note, active, events!collection_points_event_id_fkey(name, packs_per_carton)").eq("token", token).maybeSingle<Point>();
    cp = lookup.data;
    if (lookup.error) console.error("[report-food] token lookup failed", { tokenSuffix: token.slice(-6), code: lookup.error.code, message: lookup.error.message });
  }
  if (!cp) return <Shell><h1 className="text-2xl leading-tight font-semibold">Link not found</h1><p className="text-base text-[#4a525c]">This link isn’t valid. Ask your coordinator to send it again.</p></Shell>;
  if (!cp.active) return <Shell><h1 className="text-2xl leading-tight font-semibold">This link is switched off</h1><p className="text-base text-[#4a525c]">Ask your coordinator if you still need to report food for {cp.name}.</p></Shell>;

  const unread = messagesTab ? 0 : await unreadFromAdmin(db, "report", token);
  const [{ data: subs }, sent] = await Promise.all([
    db.from("batches").select("id, food, qty, edible_packs, notes, review_status, photo_path, created_at").eq("collection_point_id", cp.id).order("created_at", { ascending: false }).limit(5).returns<Sub[]>(),
    ok && UUID.test(ok) ? db.from("batches").select("id, food, qty, notes, review_status, photo_path, created_at").eq("id", ok).eq("collection_point_id", cp.id).maybeSingle<Sub>() : Promise.resolve({ data: null }),
  ]);
  const banner = sent.data;
  return <Shell>
    <div><p className="text-base text-[#4a525c]">{cp.events?.name}</p><h1 className="mt-1 text-[28px] leading-tight font-semibold">{cp.name}</h1>{cp.location_note && <p className="mt-1 text-base text-[#4a525c]">{cp.location_note}</p>}</div>
    <FieldTabs tabs={[{ href: `/r/${token}`, label: "Submit batch", on: !messagesTab }, { href: `/r/${token}?tab=messages`, label: "Messages", on: messagesTab, badge: unread }]} />
    {messagesTab ? <FieldChat channel="report" token={token} /> : <>
    {banner && <p role="status" className="flex items-start gap-2 rounded-xl border-2 border-ok bg-[#e9f6ee] px-4 py-3 text-base font-medium text-[#14633a]"><CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden /><span>Sent: {banner.qty} packs of {banner.food}. The coordinator will confirm it.{photo === "skipped" && <span className="mt-1 block text-[#6b4a08]">Photo not saved: use a JPG or PNG under 4 MB.</span>}</span></p>}
    {e && <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit"><AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />{e}</p>}
    <ReportForm token={token} perCarton={cp.events?.packs_per_carton ?? null} />
    <section aria-labelledby="recent"><h2 id="recent" className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">Your last sends</h2>{!subs?.length ? <p className="mt-2 text-base text-[#4a525c]">Nothing sent yet.</p> : <ul className="mt-1">{subs.map((s) => <li key={s.id} className="flex items-start justify-between gap-3 border-b border-line py-3"><div className="min-w-0"><p className="font-semibold break-words">{s.qty} packs · {s.edible_packs ?? "?"} edible × {s.food}{s.photo_path && <Camera className="ml-1.5 inline size-4 align-text-bottom text-[#4a525c]" aria-label="Has a photo" role="img" />}</p>{s.notes && <p className="mt-1 break-words text-sm text-[#4a525c]">Note: {s.notes}</p>}<p className="font-mono text-sm text-[#4a525c]">{fmtTime(s.created_at)}</p></div><span className={`shrink-0 text-sm font-semibold ${s.review_status === "approved" ? "text-ok" : "text-warn"}`}>{s.review_status === "approved" ? "Confirmed" : "Waiting for check"}</span></li>)}</ul>}</section>
    </>}
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[17px]"><div className="flex items-center gap-2"><img src="/fap-logo.png" alt="Feed a Person" className="h-7 w-auto" /><b>FAP <span className="text-blue">AI</span></b></div>{children}</main>; }
