"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

type T = { id: number; ok: boolean; text: string };
const Ctx = createContext<(ok: boolean, text: string) => void>(() => {});

/** Lightweight toast: success fades after a few seconds, errors stay until dismissed. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setItems((p) => p.filter((t) => t.id !== id)), []);
  const push = useCallback((ok: boolean, text: string) => {
    const id = nextId.current++;
    setItems((p) => [...p.slice(-2), { id, ok, text }]);
    if (ok) setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
        {items.map((t) => <ToastItem key={t.id} t={t} onClose={() => dismiss(t.id)} />)}
      </div>
    </Ctx.Provider>
  );
}

function ToastItem({ t, onClose }: { t: T; onClose: () => void }) {
  return (
    <div role={t.ok ? "status" : "alert"} className="toast-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg">
      {t.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#6fd39a]" aria-hidden /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-[#ff9a8f]" aria-hidden />}
      <span className="min-w-0 flex-1">{t.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss message" className="-m-1 rounded p-1 text-white/70 hover:text-white"><X className="size-4" aria-hidden /></button>
    </div>
  );
}

export const useToast = () => useContext(Ctx);
