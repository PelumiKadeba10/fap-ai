import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, MapPin, Phone, Timer } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitButton } from "@/components/submit-button";
import { ACTION_LABEL, NEXT_STATUS, STATUS } from "@/lib/status";
import { fmtDur, fmtTime, minutesBetween } from "@/lib/format";
import type { DeliveryStatus } from "@/lib/types";
import { updateMyDelivery } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My delivery · FAP AI", robots: { index: false } };

type Row = {
  id: string; qty: number; status: DeliveryStatus; safe_until: string; updated_at: string; delivered_at: string | null;
  batches: { food: string; location: string } | null;
  sites: { name: string; km: number; direction: string; contact_name: string | null; contact_phone: string | null } | null;
  volunteers: { name: string } | null;
};

const STEPS = ["Assigned", "Picked up", "On the way", "Delivered"] as const;
// A delayed delivery has been picked up and is still in transit.
const STEP_AT: Record<DeliveryStatus, number> = { assigned: 0, picked_up: 1, on_the_way: 2, delayed: 2, delivered: 3 };

export default async function VolunteerPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const { e } = await searchParams;
  const valid = /^[a-f0-9]{32}$/.test(token);
  const { data } = valid
    ? await createAdminClient()
        .from("deliveries")
        .select("id, qty, status, safe_until, updated_at, delivered_at, batches(food, location), sites(name, km, direction, contact_name, contact_phone), volunteers(name)")
        .eq("token", token)
        .maybeSingle<Row>()
    : { data: null };

  if (!data) {
    return (
      <Shell>
        <h1 className="text-2xl leading-tight font-semibold">Link not found</h1>
        <p className="text-base text-[#4a525c]">This delivery link isn’t valid. Ask your coordinator to send it again.</p>
      </Shell>
    );
  }

  const left = minutesBetween(new Date(), data.safe_until);
  const s = STATUS[data.status];
  const next = NEXT_STATUS[data.status];
  const done = data.status === "delivered";
  const urgent = !done && left < 20;
  const at = STEP_AT[data.status];

  return (
    <Shell>
      <div>
        <p className="text-base text-[#4a525c]">{data.volunteers?.name ? `Hi ${data.volunteers.name.split(" ")[0]}, your delivery` : "Your delivery"}</p>
        <h1 className="mt-1 text-[28px] leading-tight font-semibold">{data.qty} portions of {data.batches?.food}</h1>
        <p className="mt-2 flex items-start gap-2 text-base">
          <MapPin className="mt-0.5 size-5 shrink-0 text-[#4a525c]" aria-hidden />
          <span><span className="text-[#4a525c]">Pick up at </span><b className="font-semibold">{data.batches?.location}</b></span>
        </p>
      </div>

      <section aria-labelledby="to" className="border-y-2 border-ink py-4">
        <h2 id="to" className="text-sm font-semibold tracking-wide text-[#4a525c] uppercase">Deliver to</h2>
        <p className="mt-1 text-2xl leading-tight font-semibold">{data.sites?.name}</p>
        <p className="mt-1 font-mono text-base text-[#4a525c]">{data.sites?.km} km {data.sites?.direction} of the venue</p>
        {data.sites?.contact_phone && (
          <a href={`tel:${data.sites.contact_phone}`} className="mt-3 flex min-h-14 items-center gap-3 rounded-xl border-2 border-ink bg-white px-4 py-2 text-ink active:bg-soft">
            <Phone className="size-6 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm text-[#4a525c]">Tap to call{data.sites.contact_name ? ` ${data.sites.contact_name}` : ""}</span>
              <span className="block font-mono text-lg font-semibold">{data.sites.contact_phone}</span>
            </span>
          </a>
        )}
      </section>

      <section aria-label="Status" className="rounded-2xl bg-soft p-4">
        <p className="text-sm text-[#4a525c]">Status</p>
        <p className={`mt-0.5 flex items-center gap-2 text-3xl leading-tight font-semibold ${done ? "text-ok" : data.status === "delayed" ? "text-warn" : ""}`}>
          {done && <CheckCircle2 className="size-8" aria-hidden />}
          {data.status === "delayed" && <AlertTriangle className="size-8" aria-hidden />}
          {s.label}
        </p>
        <p className="mt-1 text-sm text-[#4a525c]">Last update <span className="font-mono">{fmtTime(data.delivered_at ?? data.updated_at)}</span></p>

        <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label={`Progress: step ${at + 1} of 4`}>
          {STEPS.map((label, i) => (
            <li key={label} aria-current={i === at ? "step" : undefined}>
              <div className={`h-2 rounded-full ${i < at || (done && i === at) ? "bg-ink" : i === at ? (data.status === "delayed" ? "bg-warn" : "bg-sky") : "bg-[#d5dae0]"}`} />
              <p className={`mt-1.5 text-[13px] leading-tight ${i === at ? "font-semibold text-ink" : i < at ? "text-ink" : "text-[#6b7480]"}`}>{label}</p>
            </li>
          ))}
        </ol>

        {!done && (
          <div className={`mt-4 flex items-center gap-3 border-t border-[#dde2e7] pt-3 ${urgent ? "text-crit" : ""}`}>
            {urgent ? <AlertTriangle className="size-6 shrink-0" aria-hidden /> : <Timer className="size-6 shrink-0 text-[#4a525c]" aria-hidden />}
            <p className="text-base">
              <span className={urgent ? "" : "text-[#4a525c]"}>Safe until </span>
              <b className="font-mono font-semibold">{fmtTime(data.safe_until)}</b>
              <span className="block font-semibold">{left > 0 ? `${fmtDur(left)} left${urgent ? ". Hurry." : ""}` : `${fmtDur(-left)} late`}</span>
            </p>
          </div>
        )}
      </section>

      {e && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-crit px-4 py-3 text-base font-medium text-crit">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden />{e}
        </p>
      )}

      {next.length > 0 ? (
        <div className="flex flex-col gap-3">
          {next.map((to) => (
            <form key={to} action={updateMyDelivery}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="from" value={data.status} />
              <input type="hidden" name="to" value={to} />
              <SubmitButton pendingText="Saving…" className={`min-h-16 w-full rounded-xl px-4 py-4 text-xl font-semibold active:opacity-80 ${to === "delayed" ? "border-2 border-ink bg-white text-ink" : "bg-ink text-white"}`}>{ACTION_LABEL[to]}</SubmitButton>
            </form>
          ))}
        </div>
      ) : (
        <p className="text-xl font-semibold text-ok">Delivered. Thank you for feeding someone tonight!</p>
      )}
      <p className="text-sm text-[#4a525c]">Keep this link. It only works for this delivery.</p>
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
