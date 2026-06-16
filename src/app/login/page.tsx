"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Apple, LoaderCircle, Phone } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function XOutline() {
  return (
    <svg
      viewBox="0 0 540 540"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className="h-full w-full"
    >
      <path
        d="M325.6 229.5 512 15h-44.2L306 201.2 176.8 15H27.8l195.5 281.9L27.8 522h44.2l171-196.8L379.6 522h149L325.6 229.5Zm-60.5 69.6-19.8-28-157.6-223h67.9l127.1 179.9 19.8 28 165.4 234.2H400L265.1 299.1Z"
        stroke="#2c2c2c"
        strokeWidth="5"
      />
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
    <div className="flex w-full max-w-[386px] flex-col">
      <h1 className="mb-11 text-[3.6rem] font-bold leading-none text-white sm:text-[4.25rem]">
        Happening now.
      </h1>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#eff3f4] px-5 text-[15px] font-bold text-[#0f1419] transition hover:bg-[#e6e9ea]"
        >
          <Phone className="size-5 stroke-[2.3]" />
          Continue with phone
        </button>
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={loading}
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#eff3f4] px-5 text-[15px] font-bold text-[#0f1419] transition hover:bg-[#e6e9ea] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <LoaderCircle className="size-5 animate-spin text-black/40" />
          ) : (
            <GoogleLogo />
          )}
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>
        <button
          type="button"
          className="flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#eff3f4] px-5 text-[15px] font-bold text-[#0f1419] transition hover:bg-[#e6e9ea]"
        >
          <Apple className="size-5 fill-black stroke-[2.4]" />
          Continue with Apple
        </button>
      </div>

      <div className="my-7 flex items-center gap-3 text-[15px] text-[#71767b]">
        <div className="h-px flex-1 bg-[#2f3336]" />
        <span>or</span>
        <div className="h-px flex-1 bg-[#2f3336]" />
      </div>

      <input
        type="text"
        placeholder="Email or username"
        className="h-[60px] w-full rounded border border-[#333639] bg-black px-4 text-[17px] text-white outline-none transition placeholder:text-[#71767b] focus:border-[#1d9bf0]"
      />

      <button
        type="button"
        disabled
        className="mt-5 h-12 w-full rounded-full bg-[#2f2f2f] px-5 text-[15px] font-bold text-[#777] disabled:cursor-not-allowed"
      >
        Continue
      </button>

      <p className="mt-8 text-center text-[12px] leading-4 text-[#71767b]">
        By continuing, you agree to our{" "}
        <a className="text-[#e7e9ea] hover:underline" href="#">
          Terms of Service
        </a>
        ,{" "}
        <a className="text-[#e7e9ea] hover:underline" href="#">
          Privacy Policy
        </a>{" "}
        and{" "}
        <a className="text-[#e7e9ea] hover:underline" href="#">
          Cookie Use
        </a>
        .
      </p>

      {error && (
        <p className="mt-5 text-sm text-red-400">
          Sign in failed. Try again or contact the administrator.
        </p>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <div className="min-h-screen overflow-hidden bg-black text-white">
        <main className="mx-auto flex min-h-[calc(100vh-54px)] w-full max-w-[1280px] items-center justify-center px-6 py-10 lg:justify-start lg:px-12 xl:px-16">
          <div className="grid w-full items-center gap-16 lg:grid-cols-[minmax(386px,520px)_1fr] xl:gap-32">
            <div className="flex justify-center lg:justify-start">
              <LoginForm />
            </div>
            <div className="hidden justify-center lg:flex">
              <div className="h-[490px] w-[490px] xl:h-[560px] xl:w-[560px]">
                <XOutline />
              </div>
            </div>
          </div>
        </main>
        <footer className="flex h-[54px] items-center justify-center px-6 text-[12px] text-[#71767b]">
          <nav className="flex max-w-[1180px] flex-wrap justify-center gap-x-4 gap-y-1">
            {[
              "About",
              "Download the X app",
              "Grok",
              "Help Center",
              "Terms of Service",
              "Privacy Policy",
              "Cookie Policy",
              "Accessibility",
              "Ads info",
              "Blog",
              "Careers",
              "Brand Resources",
              "Advertising",
              "Marketing",
              "X for Business",
              "Developers",
              "News",
              "Settings",
              "© 2026 X Corp.",
            ].map((item) => (
              <a key={item} href="#" className="hover:underline">
                {item}
              </a>
            ))}
          </nav>
        </footer>
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
