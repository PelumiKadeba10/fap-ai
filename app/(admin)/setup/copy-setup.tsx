"use client";
import { Copy } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { copySetup } from "../actions";
import { useAction } from "../use-action";
import { useToast } from "../toast";

/** Copies places (with people), collection points and buses from an earlier event. Never food, trips or deliveries. */
export function CopySetup({ from }: { from: { id: string; name: string } }) {
  const toast = useToast();
  const { pending, busy, run } = useAction();
  function copy() {
    let summary = "";
    run("copy", async () => { const r = await copySetup(from.id); if (r.ok) summary = r.copied ?? ""; return r; }, () => toast(true, "Copied " + summary));
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-xl border border-dashed border-[#dde2e7] p-4">
      <p className="max-w-[52ch] text-[15px]">Nothing is set up for this event yet. Start from the last one: its places, collection points and buses are copied. Food, trips and deliveries are not.</p>
      <button className="btn-dark" onClick={copy} disabled={pending} aria-busy={busy("copy")}>
        {busy("copy") ? <Spinner /> : <Copy className="size-4" aria-hidden />}
        {busy("copy") ? "Copying…" : "Copy from " + from.name}
      </button>
    </div>
  );
}
