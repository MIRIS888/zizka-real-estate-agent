import { createSupabaseServiceClient, getDefaultOrganizationId } from "@/lib/supabase/server";
import { type StoredGoogleToken, refreshGoogleToken } from "@/lib/google/oauth";

type GoogleAccountRow = {
  email: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scope: string | null;
};

function rowToAccount(row: GoogleAccountRow): { email: string; token: StoredGoogleToken } {
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

// Saves (upsert) a Google account. Pass userId when available.
export async function saveGoogleAccount(
  email: string,
  token: StoredGoogleToken,
  userId?: string,
) {
  const supabase = createSupabaseServiceClient();
  const organizationId = getDefaultOrganizationId();

  await supabase.from("google_accounts").upsert(
    {
      organization_id: organizationId,
      user_id: userId ?? null,
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

// Loads the most-recently-updated Google account.
// If userId is provided, filters by user_id first; falls back to org-level.
export async function loadGoogleAccount(userId?: string): Promise<{
  email: string;
  token: StoredGoogleToken;
} | null> {
  const supabase = createSupabaseServiceClient();
  const organizationId = getDefaultOrganizationId();

  let query = supabase
    .from("google_accounts")
    .select("email, access_token, refresh_token, token_expires_at, scope");

  if (userId) {
    query = query.eq("user_id", userId);
  } else {
    query = query.eq("organization_id", organizationId);
  }

  const { data } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!data) return null;
  return rowToAccount(data as GoogleAccountRow);
}

// Used exclusively by the cron runner:
// - Loads the account for a specific user
// - Refreshes the access token if expired
// - Persists the refreshed token back to DB
// - Returns null if no account exists (task should log a 'failed' run and skip send)
export async function loadAndRefreshGoogleAccount(userId: string): Promise<{
  email: string;
  token: StoredGoogleToken;
} | null> {
  const account = await loadGoogleAccount(userId);
  if (!account) return null;

  // Token still valid — return as-is
  if (account.token.expiresAt && account.token.expiresAt > Date.now() + 60_000) {
    return account;
  }

  if (!account.token.refreshToken) {
    // No way to refresh — return current token and let the API call surface the error
    return account;
  }

  const refreshed = await refreshGoogleToken(account.token);
  // Persist the new token immediately so the next run doesn't re-refresh unnecessarily
  await saveGoogleAccount(account.email, refreshed, userId);
  return { email: account.email, token: refreshed };
}
