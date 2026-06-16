import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { encodeGoogleToken, GOOGLE_TOKEN_COOKIE, type StoredGoogleToken } from "@/lib/google/oauth";

const GMAIL_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

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

    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(`${origin}${next}`);

      // If Google granted Gmail/Calendar access, store the token in our cookie
      // so the agent can use Gmail and Calendar without a separate OAuth flow.
      const providerToken = data.session?.provider_token;
      const providerRefreshToken = data.session?.provider_refresh_token;
      if (providerToken) {
        const googleToken: StoredGoogleToken = {
          accessToken: providerToken,
          refreshToken: providerRefreshToken ?? undefined,
          scope: GMAIL_CALENDAR_SCOPES,
        };
        response.cookies.set(GOOGLE_TOKEN_COOKIE, encodeGoogleToken(googleToken), {
          httpOnly: true,
          sameSite: "lax",
          secure: origin.startsWith("https:"),
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
      }

      return response;
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
