"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Building2, LoaderCircle } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function WorkspaceOutline() {
  return (
    <svg
      viewBox="0 0 560 460"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="h-full w-full"
    >
      <rect x="78" y="82" width="270" height="300" stroke="#202020" strokeWidth="2" />
      <rect x="62" y="62" width="302" height="22" stroke="#2a2a2a" strokeWidth="2" />
      <line x1="168" y1="84" x2="168" y2="382" stroke="#171717" strokeWidth="1" />
      <line x1="258" y1="84" x2="258" y2="382" stroke="#171717" strokeWidth="1" />
      {[145, 206, 267, 328].map((y) => (
        <line key={y} x1="78" y1={y} x2="348" y2={y} stroke="#171717" strokeWidth="1" />
      ))}
      {[104, 194, 284].map((x) =>
        [104, 166, 228, 290].map((y) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="38" height="34" stroke="#242424" />
        )),
      )}
      <rect x="195" y="336" width="48" height="46" stroke="#242424" />
      <path d="M388 320h114" stroke="#202020" strokeWidth="2" />
      <path d="M394 290l28-34 28 18 42-74" stroke="#333" strokeWidth="3" />
      <circle cx="394" cy="290" r="4" fill="#333" />
      <circle cx="422" cy="256" r="4" fill="#333" />
      <circle cx="450" cy="274" r="4" fill="#333" />
      <circle cx="492" cy="200" r="4" fill="#333" />
      <path
        d="M58 382h314c35 0 58-9 80-28"
        stroke="#151515"
        strokeWidth="2"
      />
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signInWithEmail() {
    if (!email || !password) {
      setError("E-mail a heslo jsou povinné.");
      return;
    }

    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setLoading(false);
      if (
        authError.message.toLowerCase().includes("invalid") ||
        authError.message.toLowerCase().includes("credentials") ||
        authError.message.toLowerCase().includes("password") ||
        authError.message.toLowerCase().includes("user")
      ) {
        setError("Neplatný e-mail nebo heslo.");
      } else {
        setError("Přihlášení se nezdařilo. Zkuste to znovu.");
      }
      return;
    }

    window.location.href = "/";
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
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
        Přihlášení
      </h1>
      <p className="mb-10 text-[16px] leading-6 text-[#8b8f92]">
        Přístup pouze pro členy týmu.
      </p>

      <div className="flex flex-col gap-3">
        {/* Email/password section */}
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || googleLoading}
          className="h-12 w-full rounded-md border border-[#2f3336] bg-[#0a0a0a] px-4 text-[15px] text-white placeholder-[#71767b] outline-none focus:border-[#555] disabled:opacity-60"
        />
        <input
          type="password"
          placeholder="Heslo"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void signInWithEmail();
          }}
          disabled={loading || googleLoading}
          className="h-12 w-full rounded-md border border-[#2f3336] bg-[#0a0a0a] px-4 text-[15px] text-white placeholder-[#71767b] outline-none focus:border-[#555] disabled:opacity-60"
        />

        <button
          type="button"
          onClick={() => void signInWithEmail()}
          disabled={loading || googleLoading}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-white px-5 text-[15px] font-semibold text-[#0f1419] transition hover:bg-[#e6e9ea] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <LoaderCircle className="size-5 animate-spin text-black/40" />
          ) : null}
          {loading ? "Přihlašování..." : "Přihlásit se"}
        </button>

        <p className="text-center text-[13px] text-[#71767b]">
          Nemáte účet?{" "}
          <Link href="/signup" className="text-[#e7e9ea] underline hover:text-white">
            Registrovat se
          </Link>
        </p>

        {/* Separator */}
        <div className="my-2 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#2f3336]" />
          <span className="text-[13px] text-[#71767b]">nebo</span>
          <div className="h-px flex-1 bg-[#2f3336]" />
        </div>

        {/* Google OAuth button */}
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={loading || googleLoading}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-md bg-[#eff3f4] px-5 text-[15px] font-semibold text-[#0f1419] transition hover:bg-[#e6e9ea] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {googleLoading ? (
            <LoaderCircle className="size-5 animate-spin text-black/40" />
          ) : (
            <GoogleLogo />
          )}
          {googleLoading ? "Přesměrování..." : "Pokračovat přes Google"}
        </button>
      </div>

      <p className="mt-5 text-[13px] leading-5 text-[#71767b]">
        Pokud přístup nefunguje, kontaktujte správce systému.
      </p>

      {(error ?? urlError) && (
        <p className="mt-5 text-sm text-red-400">
          {error ?? "Přihlášení se nezdařilo. Zkuste to znovu nebo kontaktujte správce."}
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <div className="min-h-screen overflow-hidden bg-black text-white">
        <main className="mx-auto flex min-h-screen w-full max-w-[1280px] items-center justify-center px-6 py-10 lg:justify-start lg:px-12 xl:px-16">
          <div className="grid w-full items-center gap-16 lg:grid-cols-[minmax(390px,520px)_1fr] xl:gap-32">
            <div className="flex justify-center lg:justify-start">
              <LoginForm />
            </div>
            <div className="hidden justify-center lg:flex">
              <div className="h-[430px] w-[520px] xl:h-[500px] xl:w-[640px]">
                <WorkspaceOutline />
              </div>
            </div>
          </div>
        </main>
      </div>
    </Suspense>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
