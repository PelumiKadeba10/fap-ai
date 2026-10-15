"use client";
import { useEffect, useRef, useState } from "react";

const MAX_SIDE = 1280;
const QUALITY = 0.7;

/** Shrinks a photo in the browser. Returns null if the browser can't decode it (e.g. HEIC); the server then decides. */
async function compress(file: File): Promise<File | null> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", QUALITY));
    if (!blob || blob.size >= file.size) return null;
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}

/** Optional photo field. Plain file input without JavaScript; with it, adds compression and a preview. */
export function PhotoInput() {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onChange() {
    const el = input.current;
    const file = el?.files?.[0];
    if (!el || !file) return setPreview(null);
    setBusy(true);
    const small = await compress(file);
    let shown = file;
    if (small) {
      try {
        const dt = new DataTransfer();
        dt.items.add(small);
        el.files = dt.files;
        shown = small;
      } catch {
        // Can't replace the file: keep the original.
      }
    }
    setPreview(URL.createObjectURL(shown));
    setBusy(false);
  }

  function remove() {
    if (input.current) input.current.value = "";
    setPreview(null);
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <label htmlFor="photo" className="text-lg font-semibold">Add a photo of the food <span className="font-normal text-[#4a525c]">(optional)</span></label>
      <input
        ref={input} id="photo" name="photo" type="file" accept="image/*" capture="environment" onChange={onChange}
        className="w-full text-base text-ink file:mr-3 file:min-h-14 file:rounded-xl file:border-2 file:border-ink file:bg-white file:px-4 file:text-base file:font-semibold file:text-ink"
      />
      <p className="text-sm text-[#4a525c]">Photograph the food, not people.</p>
      {busy && <p className="text-sm text-[#4a525c]" role="status">Getting your photo ready…</p>}
      {preview && (
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview of the food photo" width={96} height={96} className="size-24 rounded-lg object-cover" />
          <button type="button" onClick={remove} className="min-h-11 px-2 text-base font-medium text-[#4a525c] underline underline-offset-4">Remove</button>
        </div>
      )}
    </div>
  );
}
