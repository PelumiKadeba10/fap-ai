"use client";
import { useState, useTransition } from "react";
import { useToast } from "./toast";

type Result = { ok: boolean; error?: string };

/**
 * Runs a server action with a loading state per button. `run(key, fn)` marks `key` as busy until the action
 * finishes; `busy(key)` tells a button whether it is the one running. Errors show as a toast.
 * `pending` is true while any action is running, so other buttons can be disabled.
 */
export function useAction() {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);

  function run(k: string, fn: () => Promise<Result>, after?: () => void) {
    start(async () => {
      setKey(k);
      const r = await fn();
      setKey(null);
      if (!r.ok) return toast(false, r.error ?? "Something went wrong.");
      after?.();
    });
  }
  return { pending, key, run, busy: (k: string) => pending && key === k };
}
