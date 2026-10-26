"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteEvent } from "./actions";

export function EventDeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  function remove() {
    if (pending || !window.confirm(`Delete “${name}” permanently? This removes its food, deliveries, trips and setup.`)) return;
    setError("");
    start(async () => {
      const result = await deleteEvent(id);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return <>
    <button type="button" onClick={remove} disabled={pending} aria-busy={pending} aria-label={`Delete ${name}`} title={`Delete ${name}`} className="relative z-10 flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-[#fcecea] hover:text-crit disabled:opacity-50">
      <Trash2 className="size-4" aria-hidden />
    </button>
    {error && <span role="alert" className="absolute top-14 right-3 z-20 max-w-56 rounded-lg border border-crit bg-white px-2 py-1 text-xs text-crit shadow-sm">{error}</span>}
  </>;
}
