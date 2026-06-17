import { createSupabaseServiceClient, getDefaultOrganizationId } from "@/lib/supabase/server";
import { type StoredGoogleToken } from "@/lib/google/oauth";

export async function saveGoogleAccount(email: string, token: StoredGoogleToken) {
  const supabase = createSupabaseServiceClient();
  const organizationId = getDefaultOrganizationId();

  await supabase.from("google_accounts").upsert(
    {
      organization_id: organizationId,
      email,
      access_token: token.accessToken,
      refresh_token: token.refreshToken ?? null,
      token_expires_at: token.expiresAt ? new Date(token.expiresAt).toISOString() : null,
      scope: token.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "organization_id,email" },
  );
}

type GoogleAccountRow = {
  email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
};

export async function loadGoogleAccount(): Promise<{
  email: string;
  token: StoredGoogleToken;
} | null> {
  const supabase = createSupabaseServiceClient();
  const organizationId = getDefaultOrganizationId();

  const { data } = await supabase
    .from("google_accounts")
    .select("email, access_token, refresh_token, token_expires_at, scope")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  const row = data as GoogleAccountRow;

  return {
    email: row.email,
    token: {
      accessToken: row.access_token,
      refreshToken: row.refresh_token ?? undefined,
      expiresAt: row.token_expires_at ? new Date(row.token_expires_at).getTime() : undefined,
      scope: row.scope ?? undefined,
    },
  };
}
