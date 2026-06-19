import { NextResponse } from "next/server";

import { isGoogleOAuthConfigured } from "@/lib/env";
import { disconnectGoogleAccount, GOOGLE_TOKEN_COOKIE } from "@/lib/google/oauth";
import { getAuthUser } from "@/lib/supabase/auth-server";
import { createSupabaseServiceClient, getDefaultOrganizationId } from "@/lib/supabase/server";

export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseServiceClient();
  await supabase
    .from("google_accounts")
    .delete()
    .eq("user_id", user.id)
    .eq("organization_id", getDefaultOrganizationId());

  disconnectGoogleAccount();

  const response = NextResponse.json({
    configured: isGoogleOAuthConfigured(),
    connected: false,
    scopes: [],
  });
  response.cookies.delete(GOOGLE_TOKEN_COOKIE);
  return response;
}
