"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/event";
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
if (error) return setError(error.message === "Invalid login credentials" ? "Email or password is wrong." : error.message);    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="label">
        Email
        <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="label">
        Password
        <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="text-sm text-crit">{error}</p>}
      <button className="btn-dark" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/fap-logo.png" alt="Feed a Person" className="h-9 w-auto" />
        <b className="text-lg">FAP <span className="text-sky">AI</span></b>
      </div>
      <div>
        <h1 className="h1">Coordinator sign in</h1>
        <p className="lede">Volunteers don’t need to sign in. They use the link sent to them for each delivery.</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
