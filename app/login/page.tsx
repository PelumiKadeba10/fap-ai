"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message === "Invalid login credentials" ? "Email or password is wrong." : error.message);
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="label">
        Email
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} />
      </label>
      <label className="label">
        Password
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={!!error} />
      </label>
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-[#fcecea] px-3 py-2.5 text-sm font-medium text-crit">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />{error}
        </p>
      )}
      <button className="btn-dark min-h-11" disabled={busy}>
        {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="rounded-2xl border border-line p-6 sm:p-8">
        <div className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fap-logo.png" alt="Feed a Person" className="h-9 w-auto" />
          <b className="text-lg">FAP <span className="text-blue">AI</span></b>
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Coordinator sign in</h1>
        <p className="mt-1.5 mb-6 text-[15px] text-muted">Volunteers don’t need to sign in. They use the link sent to them for each delivery.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
