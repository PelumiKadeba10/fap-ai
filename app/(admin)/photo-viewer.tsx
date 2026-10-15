"use client";
import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

/** Full-size photo overlay, built in-page. Closes with the button, the backdrop or Escape. */
function Overlay({ src, label, onClose }: { src: string; label: string; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div role="dialog" aria-modal="true" aria-label={label} className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button ref={close} type="button" onClick={onClose} aria-label="Close photo" className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full bg-white text-ink">
        <X className="size-5" aria-hidden />
      </button>
      <div className="flex max-h-full max-w-full flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} width={1280} height={960} className="h-auto max-h-[85dvh] w-auto max-w-full rounded-lg object-contain" />
        <p className="text-sm text-white">{label}</p>
      </div>
    </div>
  );
}

/** Small thumbnail that opens the full-size photo. */
export function PhotoThumb({ src, label, size = 96 }: { src: string; label: string; size?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Open photo: ${label}`} className="block shrink-0 overflow-hidden rounded-lg border border-line" style={{ width: size, height: size }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={size} height={size} loading="lazy" className="size-full object-cover" />
      </button>
      {open && <Overlay src={src} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Small camera icon that opens the photo. */
export function PhotoIcon({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`View photo: ${label}`} className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:bg-soft hover:text-ink max-md:size-11">
        <Camera className="size-4" aria-hidden />
      </button>
      {open && <Overlay src={src} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}
