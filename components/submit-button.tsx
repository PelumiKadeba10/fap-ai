"use client";
import { useFormStatus } from "react-dom";
import { Spinner } from "./spinner";

/**
 * Submit button for forms that post to a server action. While the request runs it is disabled
 * (no double taps), shows a spinner and optional "working" text. Without JavaScript it is a normal submit button.
 * `bare` keeps your own layout classes (use it for buttons with custom content).
 */
export function SubmitButton({ children, pendingText, className = "", spinnerClassName, bare = false }: {
  children: React.ReactNode; pendingText?: string; className?: string; spinnerClassName?: string; bare?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={bare ? className : `${className} inline-flex items-center justify-center gap-2`} disabled={pending} aria-busy={pending}>
      {!bare && pending && <Spinner className={spinnerClassName} />}
      {!bare && pending && pendingText ? pendingText : children}
    </button>
  );
}

/** Put inside a bare SubmitButton: covers it with a spinner and a short message while the form is posting. */
export function PendingOverlay({ text }: { text: string }) {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <span className="absolute inset-0 flex items-center justify-center gap-2 rounded-[inherit] bg-white/80 text-sm font-semibold" role="status">
      <Spinner />{text}
    </span>
  );
}
