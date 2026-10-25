"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { enqueueTap, flushTaps, newTapId } from "@/lib/tap-queue";
import { Spinner } from "@/components/spinner";
import { OfflineSetup } from "@/components/offline-setup";
import { saveEdible } from "./actions";

export function EdibleForm({ token, collected, current }: { token: string; collected: number; current: number | null }) {
  const router = useRouter(); const [value, setValue] = useState(current == null ? "" : String(current)); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [note, setNote] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); if (busy) return; setBusy(true); setError(""); setNote(""); const edible = Number(value); try { await enqueueTap({ id: newTapId(), scope: token, endpoint: "/api/c/edible", at: new Date().toISOString(), label: "Edible packs", payload: { token, edible } }); const sent = await flushTaps(token); if (sent) { setNote("Edible count saved."); router.refresh(); } else setNote("Saved on this phone. It will send when the connection returns."); } catch { setError("Couldn’t save on this phone. Check the connection and try again."); } finally { setBusy(false); } }
  return <section className="rounded-2xl border-2 border-ink p-4"><OfflineSetup /><h2 className="text-xl font-semibold">After sorting</h2><p className="mt-1 text-base text-[#4a525c]">How many of the {collected} collected packs are edible?</p>{error && <p role="alert" className="mt-3 rounded-xl border-2 border-crit px-3 py-2 font-medium text-crit">{error}</p>}{note && <p role="status" className="mt-3 rounded-xl border-2 border-ok bg-[#e9f6ee] px-3 py-2 font-medium text-[#14633a]">{note}</p>}<form action={saveEdible} onSubmit={submit} className="mt-3 flex flex-col gap-3"><input type="hidden" name="token" value={token} /><label htmlFor="edible" className="text-lg font-semibold">Total edible packs after sorting</label><input id="edible" name="edible" type="number" inputMode="numeric" min={0} max={collected} required value={value} onChange={(e) => setValue(e.target.value)} className="min-h-14 w-full rounded-xl border-2 border-ink bg-white px-3 text-lg font-mono" /><button disabled={busy} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-ink px-4 py-3 text-lg font-semibold text-white disabled:opacity-70">{busy && <Spinner />}{busy ? "Saving…" : current == null ? "Save edible count" : "Update edible count"}</button></form></section>;
}
