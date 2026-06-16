"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Building2, LoaderCircle, Moon, Sun } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="grid size-8 place-items-center rounded-lg text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
      aria-label="Přepnout motiv"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

function LoginContent() {
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
    <div className="flex h-full bg-[var(--bg)]">
      {/* Left panel — branding */}
      <div className="hidden flex-col justify-between bg-[var(--primary)] p-10 lg:flex lg:w-[420px] lg:shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-white/10">
            <Building2 className="size-4 text-white" />
          </div>
          <span className="text-sm font-semibold text-white">Žižka Reality</span>
        </div>

        <div>
          <p className="text-2xl font-semibold leading-snug text-white">
            Back Office Agent
          </p>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Interní systém pro správu nemovitostí, leadů a komunikace se zájemci.
          </p>
        </div>

        <p className="text-xs text-white/30">© 2025 Žižka Reality</p>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4">
          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <div className="grid size-7 place-items-center rounded-lg bg-[var(--primary)]">
              <Building2 className="size-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-[var(--foreground)]">
              Žižka
            </span>
          </div>
          <div className="hidden lg:block" />
          <ThemeToggle />
        </div>

        {/* Form */}
        <div className="flex flex-1 flex-col items-center justify-center px-6">
          <div className="w-full max-w-[360px]">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold text-[var(--foreground)]">
                Přihlásit se
              </h1>
              <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
                Přihlášení je dostupné pouze pro oprávněné uživatele.
              </p>
            </div>

            <button
              onClick={() => void signInWithGoogle()}
              disabled={loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border bg-[var(--surface)] px-4 py-3 text-sm font-medium text-[var(--foreground)] shadow-sm transition hover:bg-[var(--surface-muted)] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <LoaderCircle className="size-4 animate-spin text-[var(--foreground-muted)]" />
              ) : (
                <GoogleLogo />
              )}
              {loading ? "Přesměrování…" : "Pokračovat přes Google"}
            </button>

            {error && (
              <div
                className="mt-4 rounded-xl px-4 py-3 text-sm"
                style={{
                  backgroundColor: "var(--error-bg)",
                  color: "var(--error-text)",
                }}
              >
                Přihlášení se nezdařilo. Zkuste to znovu nebo kontaktujte
                správce systému.
              </div>
            )}

            <p className="mt-8 text-center text-xs text-[var(--foreground-muted)]">
              Nemáte přístup?{" "}
              <a
                href="mailto:info@zizka-reality.cz"
                className="text-[var(--primary)] hover:underline"
              >
                Kontaktujte správce
              </a>
            </p>
          </div>
        </div>
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
