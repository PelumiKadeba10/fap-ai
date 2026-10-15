import type { Metadata } from "next";
import { AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { fmtTime } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { submitFood } from "./actions";
import { PhotoInput } from "./photo-input";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Report food · FAP AI", robots: { index: false } };

type Point = { id: string; name: string; active: boolean; events: { name: string } | null };
type Sub = { id: string; food: string; qty: number; notes: string | null; review_status: "pending" | "approved"; photo_path: string | null; created_at: string };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string; ok?: string; photo?: string }> }) {
  const { token } = await params;
  const { e, ok, photo } = await searchParams;
  const db = createAdminClient();
  const { data: cp } = /^[a-f0-9]{32}$/.test(token)
    ? await db.from("collection_points").select("id, name, active, events(name)").eq("token", token).maybeSingle<Point>()
    : { data: null };

  if (!cp) {
    return (
      <Shell>
        <h1 className="text-2xl leading-tight font-semibold">Link not found</h1>
        <p className="text-base text-[#4a525c]">This link isn’t valid. Ask your coordinator to send it again.</p>
      </Shell>
    );
  }
  if (!cp.active) {
    return (
      <Shell>
        <h1 className="text-2xl leading-tight font-semibold">This link is switched off</h1>
        <p className="text-base text-[#4a525c]">Ask your coordinator if you still need to report food for {cp.name}.</p>
      </Shell>
    );
  }

  const [{ data: subs }, sent] = await Promise.all([
    db.from("batches").select("id, food, qty, notes, review_status, photo_path, created_at").eq("collection_point_id", cp.id).order("created_at", { ascending: false }).limit(5).returns<Sub[]>(),
    ok && UUID.test(ok)
      ? db.from("batches").select("id, food, qty, notes, review_status, photo_path, created_at").eq("id", ok).eq("collection_point_id", cp.id).maybeSingle<Sub>()
      : Promise.resolve({ data: null }),
  ]);
  const banner = sent.data;
  const unclear = banner?.notes === "Needs a quantity";

  return (
    <Shell>
      <div>
        <p className="text-base text-[#4a525c]">{cp.events?.name}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold">{cp.name}</h1>
      </div>

      {banner && (
        <p role="status" className="flex items-start gap-2 rounded-xl border-2 border-ok bg-[#e9f6ee] px-4 py-3 text-base font-medium text-[#14633a]">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0" aria-hidden />
          <span>
            {unclear ? "Sent, but we couldn’t find a quantity. The coordinator will check it." : `Sent: ${banner.qty} ${banner.food}. The coordinator will confirm it.`}
            {photo === "skipped" && <span className="mt-1 block text-[#6b4a08]">Photo not saved: use a JPG or PNG under 4 MB.</span>}
          </span>
        </p>
      )}
      {e && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />{e}
        </p>
      )}

      <form action={submitFood} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <label htmlFor="message" className="text-lg font-semibold">What did you collect?</label>
        <textarea
          id="message" name="message" required minLength={1} maxLength={800} rows={5}
          placeholder="e.g. 200 packs of jollof rice and chicken, packed 8:15pm, still hot"
          className="min-h-40 w-full rounded-xl border-2 border-ink bg-white p-3 text-lg text-ink placeholder:text-[#6b7480]"
        />
        <p className="text-sm text-[#4a525c]">Say what it is, how many, and when it was packed.</p>
        <PhotoInput />
        <SubmitButton className="min-h-16 w-full rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white active:opacity-80" pendingText="Sending…">Send</SubmitButton>
      </form>

      <section aria-labelledby="recent">
        <h2 id="recent" className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">Your last sends</h2>
        {!subs?.length ? (
          <p className="mt-2 text-base text-[#4a525c]">Nothing sent yet.</p>
        ) : (
          <ul className="mt-1">
            {subs.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 border-b border-line py-3">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{s.qty} {s.food}{s.photo_path && <Camera className="ml-1.5 inline size-4 align-text-bottom text-[#4a525c]" aria-label="Has a photo" role="img" />}</p>
                  <p className="font-mono text-sm text-[#4a525c]">{fmtTime(s.created_at)}</p>
                </div>
                <span className={`shrink-0 text-sm font-semibold ${s.review_status === "approved" ? "text-ok" : "text-warn"}`}>
                  {s.review_status === "approved" ? "Confirmed" : "Waiting for check"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[17px]">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fap-logo.png" alt="Feed a Person" className="h-7 w-auto" />
        <b>FAP <span className="text-blue">AI</span></b>
      </div>
      {children}
    </main>
  );
}
