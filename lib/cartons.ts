/** Cartons needed for `packs`, rounded up. Null when no carton size is set. */
export function cartonsFor(packs: number, perCarton: number | null | undefined): number | null {
  if (!perCarton || perCarton < 1) return null;
  return Math.ceil(Math.max(0, packs) / perCarton);
}

/** "6 cartons (≈60 packs)", or "55 packs" when the event has no carton size. */
export function fmtPacks(packs: number, perCarton: number | null | undefined): string {
  const c = cartonsFor(packs, perCarton);
  if (c === null) return `${packs} ${packs === 1 ? "pack" : "packs"}`;
  return `${c} ${c === 1 ? "carton" : "cartons"} (≈${c * (perCarton as number)} packs)`;
}

/** Bus capacity entered in cartons is stored in packs. */
export const packsFromCartons = (cartons: number, perCarton: number) => Math.round(cartons * perCarton);
