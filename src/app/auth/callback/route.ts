import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import {
  encodeGoogleToken,
  fetchGoogleUserEmail,
  GOOGLE_TOKEN_COOKIE,
  type StoredGoogleToken,
} from "@/lib/google/oauth";
import { saveGoogleAccount } from "@/lib/google/token-store";

// Scopes that were requested during Google OAuth login
const REQUESTED_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

function getPublicOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request);
  const searchParams = new URL(request.url).searchParams;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/chat/new";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      const response = NextResponse.redirect(`${origin}${next}`);

      // If Google OAuth was used, provider_token and provider_refresh_token are
      // available here (only in this callback — Supabase doesn't persist them).
      // Save them automatically so Gmail/Calendar integration works right away.
      const providerToken = data.session.provider_token;
      const providerRefreshToken = data.session.provider_refresh_token;

      if (providerToken && providerRefreshToken) {
        try {
          const token: StoredGoogleToken = {
            accessToken: providerToken,
            refreshToken: providerRefreshToken,
            scope: REQUESTED_SCOPES,
          };

          const email = await fetchGoogleUserEmail(providerToken);
          if (email) {
            await saveGoogleAccount(email, token, data.session.user.id);
          }

          response.cookies.set(GOOGLE_TOKEN_COOKIE, encodeGoogleToken(token), {
            httpOnly: true,
            sameSite: "lax",
            secure: origin.startsWith("https:"),
            path: "/",
            maxAge: 60 * 60 * 24 * 30,
          });
        } catch {
          // Non-fatal: user is still logged in, Gmail/Calendar connect can be done manually
        }
      }

      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
