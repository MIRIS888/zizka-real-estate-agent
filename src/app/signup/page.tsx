"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, LoaderCircle } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSignup() {
    setError(null);

    if (password !== confirmPassword) {
      setError("Hesla se neshodují.");
      return;
    }

    if (password.length < 6) {
      setError("Heslo musí mít alespoň 6 znaků.");
      return;
    }

    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setLoading(false);
      const msg = authError.message.toLowerCase();
      if (msg.includes("already registered") || msg.includes("already exists") || msg.includes("user already")) {
        setError("Tento e-mail je již registrován.");
      } else if (msg.includes("invalid email") || msg.includes("valid email")) {
        setError("Neplatný e-mail.");
      } else {
        setError("Registrace se nezdařila. Zkuste to znovu.");
      }
      return;
    }

    // If a session was immediately created, redirect to home
    if (data.session) {
      window.location.href = "/";
      return;
    }

    // Otherwise email confirmation is required
    setLoading(false);
    setSuccess(true);
  }

  return (
    <div className="min-h-screen overflow-hidden bg-black text-white">
      <main className="mx-auto flex min-h-screen w-full max-w-[1280px] items-center justify-center px-6 py-10">
        <div className="flex w-full max-w-[390px] flex-col">
          <div className="mb-14 flex items-center gap-3 text-white">
            <div className="flex size-10 items-center justify-center rounded border border-[#2f3336] bg-[#050505]">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-[13px] font-semibold uppercase text-[#71767b]">
                Interní systém
              </p>
              <p className="text-[17px] font-semibold text-[#e7e9ea]">
                Žižka Real Estate Agent
              </p>
            </div>
          </div>

          <h1 className="mb-4 text-[3.2rem] font-bold leading-[0.98] text-white sm:text-[4rem]">
            Registrace
          </h1>
          <p className="mb-10 text-[16px] leading-6 text-[#8b8f92]">
            Vytvořte si nový účet.
          </p>

          {success ? (
            <div className="rounded-md border border-[#2f3336] bg-[#0a0a0a] px-5 py-4 text-[15px] text-[#e7e9ea]">
              Zkontrolujte svůj e-mail a potvrďte registraci.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="E-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="h-12 w-full rounded-md border border-[#2f3336] bg-[#0a0a0a] px-4 text-[15px] text-white placeholder-[#71767b] outline-none focus:border-[#555] disabled:opacity-60"
              />
              <input
                type="password"
                placeholder="Heslo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="h-12 w-full rounded-md border border-[#2f3336] bg-[#0a0a0a] px-4 text-[15px] text-white placeholder-[#71767b] outline-none focus:border-[#555] disabled:opacity-60"
              />
              <input
                type="password"
                placeholder="Potvrďte heslo"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleSignup();
                }}
                disabled={loading}
                className="h-12 w-full rounded-md border border-[#2f3336] bg-[#0a0a0a] px-4 text-[15px] text-white placeholder-[#71767b] outline-none focus:border-[#555] disabled:opacity-60"
              />

              <button
                type="button"
                onClick={() => void handleSignup()}
                disabled={loading}
                className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-white px-5 text-[15px] font-semibold text-[#0f1419] transition hover:bg-[#e6e9ea] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <LoaderCircle className="size-5 animate-spin text-black/40" />
                ) : null}
                {loading ? "Registrace..." : "Registrovat"}
              </button>

              {error && (
                <p className="mt-2 text-sm text-red-400">{error}</p>
              )}
            </div>
          )}

          <p className="mt-8 text-[13px] text-[#71767b]">
            Již máte účet?{" "}
            <Link href="/login" className="text-[#e7e9ea] underline hover:text-white">
              Zpět na přihlášení
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
