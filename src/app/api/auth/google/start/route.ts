import { NextResponse } from "next/server";

import { createGoogleAuthorizationUrl } from "@/lib/google/oauth";

export function GET() {
  try {
    return NextResponse.redirect(createGoogleAuthorizationUrl());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google OAuth is not configured.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
