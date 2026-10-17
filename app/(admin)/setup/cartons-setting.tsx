"use client";
import { useState } from "react";
import { Spinner } from "@/components/spinner";
import { setPacksPerCarton } from "../actions";
import { useAction } from "../use-action";

/** How many packs fit in one carton. Loading lists and bus pages count cartons from this. */
export function CartonsSetting({ value }: { value: number | null }) {
  const { busy, run } = useAction();
  const [v, setV] = useState(value == null ? "" : String(value));
  const commit = () => {
    const n = v.trim() === "" ? null : Number(v);
    if (n === value || (n !== null && (!Number.isInteger(n) || n < 1))) return;
    run("cartons", () => setPacksPerCarton(n));
  };

  return (
    <section id="cartons" className="flex scroll-mt-24 flex-col gap-3" aria-labelledby="cartons-title">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="cartons-title" className="h2">Cartons</h2>
        <span className="text-[13px] text-muted">Loading lists and bus pages show cartons, e.g. “6 cartons (≈60 packs)”. Leave empty to show packs only.</span>
      </div>
      <label className="label max-w-xs">Packs per carton
        <span className="flex items-center gap-2">
          <input className="input w-28 font-mono" type="number" inputMode="numeric" min={1} step={1} value={v} placeholder="10" onChange={(e) => setV(e.target.value)} onBlur={commit} />
          {busy("cartons") && <span className="inline-flex items-center gap-1.5 text-xs text-muted" role="status"><Spinner className="size-3.5" />Saving…</span>}
        </span>
      </label>
    </section>
  );
}
