"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/hooks";
import { Button, Notice, IconLock, IconAlert } from "@/components/ui";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const denied = params.get("denied") === "1";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setBusy(false); return; }
    router.replace("/admin");
    router.refresh();
  };

  const field = "mt-1.5 w-full rounded-[var(--radius-md)] border border-[var(--color-line)] bg-white px-3.5 py-3 text-[15px] outline-none transition-colors focus:border-[var(--color-accent)]";

  return (
    <main className="grid min-h-screen place-items-center px-5">
      <form onSubmit={submit} className="rise w-full max-w-sm rounded-[var(--radius-xl)] bg-white p-7 shadow-[var(--shadow-md)]">
        <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <IconLock size={21} />
        </span>
        <h1 className="headline mt-4 text-[24px] font-semibold">Operations sign in</h1>
        <p className="mt-1 text-[14px] text-[var(--color-ink-2)]">
          Platform administrators only. Shop staff sign in at <span className="whitespace-nowrap">/merchant/login</span>.
        </p>

        {denied && (
          <div className="mt-4">
            <Notice tone="alert" title="That account isn't an administrator" icon={<IconAlert size={16} />}>
              It may still have access to a shop console.
            </Notice>
          </div>
        )}

        <label className="mt-5 block">
          <span className="label">Email</span>
          <input type="email" value={email} required autoComplete="username"
            onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="mt-3.5 block">
          <span className="label">Password</span>
          <input type="password" value={password} required autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)} className={field} />
        </label>

        {error && (
          <div className="mt-4">
            <Notice tone="alert" title="Couldn't sign you in" icon={<IconAlert size={16} />}>{error}</Notice>
          </div>
        )}

        <div className="mt-6">
          <Button type="submit" full size="lg" loading={busy}>Sign in</Button>
        </div>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
