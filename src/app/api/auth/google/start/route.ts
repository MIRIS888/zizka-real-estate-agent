import { type NextRequest, NextResponse } from "next/server";

import { createGoogleAuthorizationUrl } from "@/lib/google/oauth";

export function GET(request: NextRequest) {
  try {
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/auth/google/callback`;
    return NextResponse.redirect(createGoogleAuthorizationUrl(redirectUri));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google OAuth is not configured.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
