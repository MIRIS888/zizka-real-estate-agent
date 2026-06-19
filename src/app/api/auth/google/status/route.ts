import { NextResponse } from "next/server";

import { isGoogleOAuthConfigured } from "@/lib/env";
import {
  SCOPE_GMAIL_READ,
  SCOPE_GMAIL_SEND,
  SCOPE_CALENDAR_EVENTS,
  SCOPE_CALENDAR_READ,
  hasScope,
} from "@/lib/google/scopes";
import { loadGoogleAccount } from "@/lib/google/token-store";
import { getAuthUser } from "@/lib/supabase/auth-server";

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configured = isGoogleOAuthConfigured();
  const account = await loadGoogleAccount(user.id).catch(() => null);

  if (!account) {
    return NextResponse.json({
      configured,
      connected: false,
      scopes: [],
      capabilities: {
        gmailRead: false,
        gmailSend: false,
        calendarRead: false,
        calendarWrite: false,
      },
    });
  }

  const scope = account.token.scope;

  return NextResponse.json({
    configured,
    connected: true,
    email: account.email,
    hasRequiredScopes: hasScope(scope, SCOPE_GMAIL_SEND) && hasScope(scope, SCOPE_CALENDAR_EVENTS),
    scopes: scope?.split(" ") ?? [],
    capabilities: {
      gmailRead: hasScope(scope, SCOPE_GMAIL_READ),
      gmailSend: hasScope(scope, SCOPE_GMAIL_SEND),
      calendarRead: hasScope(scope, SCOPE_CALENDAR_READ),
      calendarWrite: hasScope(scope, SCOPE_CALENDAR_EVENTS),
    },
  });
}
