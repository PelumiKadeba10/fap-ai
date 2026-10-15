import { Loader2 } from "lucide-react";

/** Small spinning indicator for buttons that are working. Hidden from screen readers; the button says what is happening. */
export function Spinner({ className = "size-4" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden />;
}
