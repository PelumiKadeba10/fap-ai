"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { OfflineBanner, OfflineSetup } from "@/components/offline-setup";
import { enqueueTap, flushTaps, newTapId, removeTap, useOnline, useTapSync, useTaps } from "@/lib/tap-queue";
import { fmtTime } from "@/lib/format";
import { pickupAction } from "./actions";

const BTN = "min-h-16 w-full rounded-xl px-4 py-4 text-xl font-semibold active:opacity-80 disabled:opacity-70";
const ENDPOINT = "/api/c/pickup";

/**
 * Keeps the Pick-ups queue moving and lists taps still waiting for signal. Shown on both tabs so a tap saved on one is sent
 * even when the lead is looking at the other.
 */
export function PickupStatus({ token, banner }: { token: string; banner: boolean }) {
  const router = useRouter();
  const online = useOnline();
  const { taps, rejected } = useTaps(token);
  const refresh = useCallback(() => router.refresh(), [router]);
  useTapSync(token, refresh);
  const mine = taps.filter((t) => t.endpoint === ENDPOINT);
  return (
    <>
      <OfflineSetup />
      {banner && !online && <OfflineBanner>No signal. Keep tapping as normal: your taps are saved on this phone and sent when you are back online.</OfflineBanner>}
      {mine.length > 0 && (
        <section aria-labelledby="pickup-waiting" className="rounded-xl border-2 border-warn bg-[#fff6e5] px-4 py-3">
          <h2 id="pickup-waiting" className="flex items-center gap-2 text-base font-semibold text-[#6b4a08]"><Clock className="size-5 shrink-0" aria-hidden />Saved on this phone, not sent yet</h2>
          <ul className="mt-1">
            {mine.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-1.5 text-base">
                <span className="min-w-0"><b>{t.label}</b> <span className="font-mono text-sm text-[#4a525c]">{fmtTime(t.at)}</span>{rejected[t.id] && <span className="block text-sm font-medium text-crit">{rejected[t.id]}</span>}</span>
                {rejected[t.id] && <button type="button" onClick={() => removeTap(t.id)} className="min-h-11 shrink-0 px-2 text-base font-medium text-[#4a525c] underline underline-offset-4">Discard</button>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** The three buttons for one pledge. Without JavaScript they are plain form posts; with it, taps are saved on the phone and sent in the background. */
export function PickupButtons({ token, pledge }: { token: string; pledge: { id: string; tent: string; status: "pledged" | "on_the_way"; packs: number | null } }) {
  const router = useRouter();
  const { taps, rejected } = useTaps(token);
  const [busy, setBusy] = useState("");

  const waiting = taps.filter((t) => t.endpoint === ENDPOINT && t.payload.pledge === pledge.id && !rejected[t.id]);
  const finished = waiting.find((t) => t.payload.intent === "picked_up" || t.payload.intent === "no_food");
  const onTheWay = pledge.status === "on_the_way" || waiting.some((t) => t.payload.intent === "on_the_way");

  async function send(e: React.FormEvent<HTMLFormElement>, intent: string) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const packs = Number(String(fd.get("packs") ?? "").trim());
    const note = String(fd.get("note") ?? "").trim();
    const label = intent === "on_the_way" ? `On my way: ${pledge.tent}` : intent === "no_food" ? `No food: ${pledge.tent}` : `Picked up ${packs} packs: ${pledge.tent}`;
    setBusy(intent);
    try {
      await enqueueTap({
        id: newTapId(), scope: token, endpoint: ENDPOINT, at: new Date().toISOString(), label,
        payload: { token, intent, pledge: pledge.id, ...(intent === "picked_up" ? { packs } : {}), ...(note ? { note } : {}) },
      });
      if (await flushTaps(token)) router.refresh();
    } catch {
      window.alert("Couldn’t save that tap on this phone. Check your connection and tap again.");
    } finally {
      setBusy("");
    }
  }

  if (finished) {
    return <p className="mt-3 flex items-center gap-2 text-base font-semibold text-warn"><Clock className="size-5 shrink-0" aria-hidden />Saved on this phone: {finished.label}. It will be sent when you are back online.</p>;
  }

  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="token" value={token} /><input type="hidden" name="pledge" value={pledge.id} /><input type="hidden" name="intent" value={intent} />
    </>
  );

  return (
    <div className="mt-3 flex flex-col gap-3">
      {!onTheWay && (
        <form action={pickupAction} onSubmit={(e) => send(e, "on_the_way")}>
          {hidden("on_the_way")}
          <button disabled={!!busy} aria-busy={busy === "on_the_way"} className={`${BTN} inline-flex items-center justify-center gap-2 border-2 border-ink bg-white text-ink`}>
            {busy === "on_the_way" && <Spinner />}{busy === "on_the_way" ? "Sending…" : "On my way"}
          </button>
        </form>
      )}
      <form action={pickupAction} onSubmit={(e) => send(e, "picked_up")} className="flex flex-col gap-2 rounded-xl border border-[#dde2e7] p-3">
        {hidden("picked_up")}
        <label className="text-base font-semibold" htmlFor={"packs-" + pledge.id}>Packs picked up</label>
        <input id={"packs-" + pledge.id} name="packs" type="number" inputMode="numeric" min={1} required defaultValue={pledge.packs ?? undefined} className="min-h-14 w-full rounded-xl border-2 border-ink bg-white px-3 text-xl text-ink" />
        <label className="text-base font-semibold" htmlFor={"note-" + pledge.id}>Note <span className="font-normal text-[#4a525c]">(optional)</span></label>
        <input id={"note-" + pledge.id} name="note" maxLength={120} className="min-h-14 w-full rounded-xl border-2 border-ink bg-white px-3 text-lg text-ink" />
        <button disabled={!!busy} aria-busy={busy === "picked_up"} className={`${BTN} inline-flex items-center justify-center gap-2 bg-ink text-white`}>
          {busy === "picked_up" && <Spinner />}{busy === "picked_up" ? "Saving…" : "Picked up"}
        </button>
      </form>
      <form action={pickupAction} onSubmit={(e) => send(e, "no_food")}>
        {hidden("no_food")}
        <button disabled={!!busy} aria-busy={busy === "no_food"} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-crit bg-white px-4 py-3 text-lg font-semibold text-crit active:opacity-80 disabled:opacity-70">
          {busy === "no_food" && <Spinner />}{busy === "no_food" ? "Sending…" : "No food"}
        </button>
      </form>
    </div>
  );
}
