"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" className="btn-line no-print" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> Print report
    </button>
  );
}
