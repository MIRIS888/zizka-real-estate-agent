"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Building2, LoaderCircle } from "lucide-react";
import { Syne } from "next/font/google";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const syne = Syne({ subsets: ["latin"], weight: ["700", "800"] });

function BuildingOutline() {
  const s = "#1E1E1E";
  const st = "#191919";
  const cols = [71, 171, 271];
  const rows = [64, 131, 198, 265, 332];

  return (
    <svg
      viewBox="0 0 400 490"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="w-full h-full"
    >
      {/* Cornice */}
      <rect x="35" y="36" width="330" height="18" stroke={s} strokeWidth="1.2" />

      {/* Building body */}
      <rect x="50" y="54" width="300" height="416" stroke={s} strokeWidth="1.5" />

      {/* Bay dividers */}
      <line x1="150" y1="54" x2="150" y2="389" stroke={st} strokeWidth="0.6" />
      <line x1="250" y1="54" x2="250" y2="389" stroke={st} strokeWidth="0.6" />

      {/* Floor dividers */}
      {[121, 188, 255, 322, 389].map((y) => (
        <line key={y} x1="50" y1={y} x2="350" y2={y} stroke={st} strokeWidth="0.7" />
      ))}

      {/* Windows */}
      {rows.map((wy) =>
        cols.map((wx) => (
          <rect
            key={`${wx}-${wy}`}
            x={wx}
            y={wy}
            width={58}
            height={50}
            stroke={s}
            strokeWidth="1"
          />
        )),
      )}

      {/* Entrance door */}
      <rect x="175" y="397" width="50" height="73" stroke={s} strokeWidth="1.2" />
      <line x1="175" y1="416" x2="225" y2="416" stroke={st} strokeWidth="0.8" />

      {/* Ground line */}
      <line x1="0" y1="470" x2="400" y2="470" stroke="#161616" strokeWidth="1" />
    </svg>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const [loading, setLoading] = useState(false);

  async function signInWithGoogle() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex w-full max-w-[340px] flex-col gap-7">
      <h1
        className={`${syne.className} text-[2.8rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-[3.4rem] xl:text-[4rem]`}
      >
        Mějte přehled.
      </h1>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => void signInWithGoogle()}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-3.5 text-[15px] font-semibold text-black transition hover:bg-neutral-100 active:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <LoaderCircle className="size-5 animate-spin text-black/40" />
          ) : (
            <GoogleLogo />
          )}
          {loading ? "Přesměrování…" : "Pokračovat přes Google"}
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400">
          Přihlášení se nezdařilo. Zkuste to znovu nebo kontaktujte správce.
        </p>
      )}

      <p className="text-[13px] leading-5 text-neutral-600">
        Přístup pouze pro pozvané.{" "}
        <a
          href="mailto:info@zizka-reality.cz"
          className="text-neutral-400 underline-offset-2 hover:underline"
        >
          Kontaktujte správce.
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <div className="min-h-screen bg-black">
        <div className="flex min-h-screen">
          {/* Left column */}
          <div className="flex flex-1 flex-col px-10 py-10 sm:px-14 lg:px-16 xl:px-24">
            <Building2 className="size-8 shrink-0 text-white" />
            <div className="flex flex-1 items-center">
              <LoginForm />
            </div>
          </div>

          {/* Right column — building outline */}
          <div className="hidden lg:flex flex-1 items-center justify-center">
            <div className="w-[38vw] max-w-[480px]">
              <BuildingOutline />
            </div>
          </div>
        </div>
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
