import { type NextRequest, NextResponse } from "next/server";

import { createGoogleAuthorizationUrl } from "@/lib/google/oauth";
import { getAuthUser } from "@/lib/supabase/auth-server";

function getPublicOrigin(request: NextRequest): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Nejste přihlášený." }, { status: 401 });
  }

  try {
    const origin = getPublicOrigin(request);
    const redirectUri = `${origin}/api/auth/google/callback`;
    return NextResponse.redirect(createGoogleAuthorizationUrl(redirectUri));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google OAuth is not configured.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
