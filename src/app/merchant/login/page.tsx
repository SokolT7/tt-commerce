"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/hooks";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setBusy(false); return; }
    router.replace(params.get("next") || "/merchant");
    router.refresh();
  };

  return (
    <main className="grid min-h-screen place-items-center bg-ground px-5">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-line bg-surface p-6">
        <div className="eyebrow">Gate Delivery</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Shop sign in</h1>
        <p className="mt-1 text-sm text-ink-2">Use the account for your outlet.</p>

        <label className="mt-5 block">
          <span className="eyebrow">Email</span>
          <input
            type="email" value={email} required autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-surface px-3 py-2.5"
          />
        </label>
        <label className="mt-3 block">
          <span className="eyebrow">Password</span>
          <input
            type="password" value={password} required autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-surface px-3 py-2.5"
          />
        </label>

        {error && (
          <p className="mt-3 rounded p-3 text-sm"
             style={{ background: "var(--color-alert-soft)", color: "var(--color-alert)" }}>
            {error}
          </p>
        )}

        <button
          type="submit" disabled={busy}
          className="mt-5 w-full rounded-lg py-3 font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-accent)" }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
