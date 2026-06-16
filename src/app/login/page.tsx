"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Building2 } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  async function signInWithGoogle() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-[var(--bg)]">
      <div className="w-full max-w-sm px-6">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="grid size-11 place-items-center rounded-xl bg-[var(--primary)]">
            <Building2 className="size-5 text-white" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-[var(--foreground)]">
            Žižka Back Office
          </h1>
          <p className="mt-2 text-sm text-[var(--foreground-muted)]">
            Přihlaste se pro přístup k systému
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => void signInWithGoogle()}
            className="flex w-full items-center justify-center gap-3 rounded-xl border bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-muted)] active:scale-[0.99]"
          >
            <GoogleLogo />
            Přihlásit se přes Google
          </button>
        </div>

        {error && (
          <p
            className="mt-4 rounded-lg px-4 py-3 text-center text-xs"
            style={{
              backgroundColor: "var(--error-bg)",
              color: "var(--error-text)",
            }}
          >
            Přihlášení se nezdařilo. Zkuste to znovu nebo kontaktujte správce.
          </p>
        )}

        <p className="mt-8 text-center text-xs text-[var(--foreground-muted)]">
          Přístup pouze pro oprávněné uživatele.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
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
