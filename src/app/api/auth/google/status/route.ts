import { NextResponse } from "next/server";

import { isGoogleOAuthConfigured } from "@/lib/env";
import { loadGoogleAccount } from "@/lib/google/token-store";
import { getAuthUser } from "@/lib/supabase/auth-server";

const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

function hasRequiredScopes(scope?: string): boolean {
  const granted = (scope ?? "").split(" ");
  return REQUIRED_SCOPES.every((s) => granted.includes(s));
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = isGoogleOAuthConfigured();
  const account = await loadGoogleAccount(user.id).catch(() => null);

  if (!account) {
    return NextResponse.json({ configured, connected: false, scopes: [] });
  }

  return NextResponse.json({
    configured,
    connected: true,
    email: account.email,
    hasRequiredScopes: hasRequiredScopes(account.token.scope),
    scopes: account.token.scope?.split(" ") ?? [],
  });
}
