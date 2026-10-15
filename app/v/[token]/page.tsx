import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
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
        <h1 className="text-2xl font-semibold">Link not found</h1>
        <p className="text-muted">This delivery link isn’t valid. Ask your coordinator to send it again.</p>
      </Shell>
    );
  }

  const left = minutesBetween(new Date(), data.safe_until);
  const s = STATUS[data.status];
  const next = NEXT_STATUS[data.status];

  return (
    <Shell>
      <div>
        <p className="text-sm text-muted">{data.volunteers?.name ? `Hi ${data.volunteers.name.split(" ")[0]}, your delivery` : "Your delivery"}</p>
        <h1 className="mt-1 text-2xl leading-tight font-semibold">{data.qty} portions of {data.batches?.food}</h1>
      </div>

      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-2.5 text-[15px]">
        <dt className="text-muted">Pick up at</dt><dd className="font-medium">{data.batches?.location}</dd>
        <dt className="text-muted">Deliver to</dt><dd className="font-medium">{data.sites?.name} <span className="text-muted">· {data.sites?.km} km {data.sites?.direction}</span></dd>
        {data.sites?.contact_phone && (<><dt className="text-muted">Contact</dt><dd className="font-medium"><a className="text-blue underline" href={`tel:${data.sites.contact_phone}`}>{data.sites.contact_name ? `${data.sites.contact_name} · ` : ""}{data.sites.contact_phone}</a></dd></>)}
        <dt className="text-muted">Safe until</dt>
        <dd className={`font-medium ${data.status !== "delivered" && left < 20 ? "text-crit" : ""}`}>
          {fmtTime(data.safe_until)}{data.status !== "delivered" && <span className="text-muted"> · {left > 0 ? `${fmtDur(left)} left` : `${fmtDur(-left)} late`}</span>}
        </dd>
      </dl>

      <div className="rounded-xl bg-soft p-4">
        <p className="text-sm text-muted">Status</p>
        <p className="text-xl font-semibold">{s.label}</p>
        <p className="text-sm text-muted">Last update {fmtTime(data.delivered_at ?? data.updated_at)}</p>
      </div>

      {e && <p className="text-sm text-crit">{e}</p>}

      {next.length > 0 ? (
        <div className="flex flex-col gap-3">
          {next.map((to) => (
            <form key={to} action={updateMyDelivery}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="from" value={data.status} />
              <input type="hidden" name="to" value={to} />
              <button className={`w-full rounded-xl px-4 py-4 text-lg font-semibold ${to === "delayed" ? "border border-[#dde2e7] bg-white text-ink" : "bg-ink text-white"}`}>
                {ACTION_LABEL[to]}
              </button>
            </form>
          ))}
        </div>
      ) : (
        <p className="text-lg font-semibold text-ok">Delivered. Thank you!</p>
      )}
      <p className="text-xs text-muted">Keep this link. It only works for this delivery.</p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-6">
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fap-logo.png" alt="Feed a Person" className="h-7 w-auto" />
        <b>FAP <span className="text-sky">AI</span></b>
      </div>
      {children}
    </main>
  );
}
