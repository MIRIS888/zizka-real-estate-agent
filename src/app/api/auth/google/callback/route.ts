import { type NextRequest, NextResponse } from "next/server";

import {
  exchangeGoogleCode,
  encodeGoogleToken,
  fetchGoogleUserEmail,
  GOOGLE_TOKEN_COOKIE,
} from "@/lib/google/oauth";
import { saveGoogleAccount } from "@/lib/google/token-store";
import { getAuthUser } from "@/lib/supabase/auth-server";

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
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=google_denied`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=google_failed`);
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const token = await exchangeGoogleCode(code, redirectUri);
    const email = await fetchGoogleUserEmail(token.accessToken);
    const user = await getAuthUser().catch(() => null);

    if (email) {
      await saveGoogleAccount(email, token, user?.id).catch(() => {
        // Non-fatal: cron won't have a stored token but chat still works via cookie
      });
    }

    const response = NextResponse.redirect(`${origin}/`);
    response.cookies.set(GOOGLE_TOKEN_COOKIE, encodeGoogleToken(token), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https:"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch {
    return NextResponse.redirect(`${origin}/login?error=google_failed`);
  }
}
