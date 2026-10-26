import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FoodDonation, Pledge } from "@/lib/types";
import { byPickupTime } from "@/lib/pledges";
import { PickupList } from "@/app/c/[token]/pickup-list";
import { PickupStatus } from "@/app/c/[token]/pickup-actions";
import { DonationForm } from "@/app/c/[token]/donation-form";
import { FieldChat } from "@/components/field-chat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Food intake record · FAP AI", robots: { index: false }, manifest: "/manifest.webmanifest" };
type Point = { id: string; event_id: string; name: string; location_note: string | null; active: boolean; events: { name: string } | null };

export default async function IntakeRecordPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ tab?: string; done?: string; e?: string }> }) {
  const { token } = await params;
  const { tab, done, e } = await searchParams;
  const donatedTab = tab === "donated";
  const db = createAdminClient();
  let cp: Point | null = null;
  if (/^[a-f0-9]{32}$/.test(token)) cp = (await db.from("collection_points").select("id, event_id, name, location_note, active, events!collection_points_event_id_fkey(name)").eq("intake_token", token).maybeSingle<Point>()).data;
  if (!cp) return <Shell><h1 className="text-2xl leading-tight font-semibold">Link not found</h1><p className="text-base text-[#4a525c]">This link isn’t valid. Ask your coordinator to send it again.</p></Shell>;
  if (!cp.active) return <Shell><h1 className="text-2xl leading-tight font-semibold">This link is switched off</h1><p className="text-base text-[#4a525c]">Ask your coordinator if you still need to record food intake for {cp.name}.</p></Shell>;
  const [{ data: pledgeRows }, { data: donations }] = await Promise.all([
    db.from("pledges").select("*").eq("collection_point_id", cp.id).returns<Pledge[]>(),
    db.from("food_donations").select("*").eq("collection_point_id", cp.id).order("created_at", { ascending: false }).returns<FoodDonation[]>(),
  ]);
  const pledges = byPickupTime(pledgeRows ?? []);
  const openCount = pledges.filter((p) => p.status === "pledged" || p.status === "on_the_way").length;
  return <Shell>
    <div><p className="text-base text-[#4a525c]">{cp.events?.name}</p><h1 className="mt-1 text-[28px] leading-tight font-semibold">{cp.name}</h1>{cp.location_note && <p className="mt-1 text-base text-[#4a525c]">{cp.location_note}</p>}</div>
    <nav aria-label="Sections" className="grid grid-cols-2 gap-2"><Link href={`/i/${token}`} aria-current={!donatedTab ? "page" : undefined} className={`flex min-h-14 items-center justify-center gap-1 rounded-xl border-2 border-ink px-2 text-center text-lg font-semibold ${!donatedTab ? "bg-ink text-white" : "bg-white text-ink"}`}>Pick-ups{openCount > 0 && <span className="rounded-full bg-orange px-2 py-0.5 font-mono text-sm text-white">{openCount}</span>}</Link><Link href={`/i/${token}?tab=donated`} aria-current={donatedTab ? "page" : undefined} className={`flex min-h-14 items-center justify-center rounded-xl border-2 border-ink px-2 text-center text-lg font-semibold ${donatedTab ? "bg-ink text-white" : "bg-white text-ink"}`}>Food donated</Link></nav>
    {!donatedTab && <><PickupStatus token={token} banner /><PickupList token={token} pledges={pledges} done={done} /></>}
    {donatedTab && <DonationForm token={token} total={(donations ?? []).reduce((n, d) => n + d.packs, 0)} />}
    <FieldChat channel="intake" token={token} />
    {e && <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit"><AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />{e}</p>}
  </Shell>;
}

function Shell({ children }: { children: React.ReactNode }) { return <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[17px]"><div className="flex items-center gap-2"><img src="/fap-logo.png" alt="Feed a Person" className="h-7 w-auto" /><b>FAP <span className="text-blue">AI</span></b></div>{children}</main>; }
