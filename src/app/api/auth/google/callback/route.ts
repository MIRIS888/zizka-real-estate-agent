import { type NextRequest, NextResponse } from "next/server";

import {
  exchangeGoogleCode,
  encodeGoogleToken,
  GOOGLE_TOKEN_COOKIE,
} from "@/lib/google/oauth";

function getPublicOrigin(request: NextRequest): string {
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
    return NextResponse.redirect(`${origin}/?google=error:${error}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?google=missing-code`);
  }

  try {
    const redirectUri = `${origin}/api/auth/google/callback`;
    const token = await exchangeGoogleCode(code, redirectUri);
    const response = NextResponse.redirect(`${origin}/?google=connected`);
    response.cookies.set(GOOGLE_TOKEN_COOKIE, encodeGoogleToken(token), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https:"),
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch {
    return NextResponse.redirect(`${origin}/?google=error`);
  }
}
