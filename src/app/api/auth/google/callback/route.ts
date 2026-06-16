import { NextResponse } from "next/server";

import {
  exchangeGoogleCode,
  encodeGoogleToken,
  GOOGLE_TOKEN_COOKIE,
} from "@/lib/google/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?google=error:${error}`, url.origin));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?google=missing-code", url.origin));
  }

  try {
    const redirectUri = `${url.origin}/api/auth/google/callback`;
    const token = await exchangeGoogleCode(code, redirectUri);
    const response = NextResponse.redirect(new URL("/?google=connected", url.origin));
    response.cookies.set(GOOGLE_TOKEN_COOKIE, encodeGoogleToken(token), {
      httpOnly: true,
      sameSite: "lax",
      secure: url.protocol === "https:",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/?google=error", url.origin));
  }
}
