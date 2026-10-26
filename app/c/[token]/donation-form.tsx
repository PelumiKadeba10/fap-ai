"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudOff } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { OfflineBanner, OfflineSetup } from "@/components/offline-setup";
import { enqueueTap, flushTaps, newTapId, removeTap, useOnline, useTapSync, useTaps } from "@/lib/tap-queue";
import { fmtTime } from "@/lib/format";

const ENDPOINT = "/api/c/donate";

export function DonationForm({ token, total }: { token: string; total: number }) {
  const router = useRouter();
  const online = useOnline();
  const { taps, rejected } = useTaps(token);
  const refresh = useCallback(() => router.refresh(), [router]);
  useTapSync(token, refresh);
  const pending = taps.filter((t) => t.endpoint === ENDPOINT);
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const packs = Number(fd.get("packs"));
    const dropper = String(fd.get("dropper") ?? "").trim();
    setBusy(true);
    try {
      await enqueueTap({ id: newTapId(), scope: token, endpoint: ENDPOINT, at: new Date().toISOString(), label: `${packs} donated packs`, payload: { token, packs, ...(dropper ? { dropper } : {}) } });
      await flushTaps(token);
      e.currentTarget.reset();
      router.refresh();
    } catch { window.alert("Couldn't save that donation on this phone. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function discard(id: string) { setDiscarding(id); try { await removeTap(id); } finally { setDiscarding(""); } }

  return <>
    <OfflineSetup />
    {!online && <OfflineBanner>No signal. This donation is saved on the phone and sent when you are back online.</OfflineBanner>}
    <section className="rounded-xl border-2 border-ink bg-soft px-4 py-3">
      <h2 className="text-xl font-semibold">Food donated</h2>
      <p className="mt-1 text-base text-[#4a525c]"><b className="font-mono text-ink">{total}</b> packs donated at this collection point.</p>
    </section>
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="donated-packs" className="text-lg font-semibold">Number of packs donated</label>
      <input id="donated-packs" name="packs" type="number" inputMode="numeric" min={1} max={100000} required className="min-h-14 w-full rounded-xl border-2 border-ink bg-white px-3 text-lg font-mono text-ink" />
      <label htmlFor="dropper" className="text-lg font-semibold">Name of dropper <span className="font-normal text-[#4a525c]">(optional)</span></label>
      <input id="dropper" name="dropper" maxLength={120} className="min-h-14 w-full rounded-xl border-2 border-ink bg-white px-3 text-lg text-ink" />
      <button disabled={busy} aria-busy={busy} className="inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-4 text-xl font-semibold text-white disabled:opacity-70">{busy && <Spinner />}{busy ? "Saving…" : "Record donated food"}</button>
    </form>
    {pending.length > 0 && <section className="rounded-xl border-2 border-warn bg-[#fff6e5] px-4 py-3"><h2 className="flex items-center gap-2 text-base font-semibold text-[#6b4a08]"><CloudOff className="size-5" aria-hidden />Saved on this phone, not sent yet</h2><ul className="mt-1">{pending.map((t) => <li key={t.id} className="flex items-start justify-between gap-3 py-1.5"><span><b>{t.label}</b> <span className="font-mono text-sm">{fmtTime(t.at)}</span>{rejected[t.id] && <span className="block text-sm text-crit">{rejected[t.id]}</span>}</span>{rejected[t.id] && <button type="button" onClick={() => discard(t.id)} disabled={!!discarding} className="min-h-11 px-2 text-sm underline">{discarding === t.id ? "Discarding…" : "Discard"}</button>}</li>)}</ul></section>}
  </>;
}
