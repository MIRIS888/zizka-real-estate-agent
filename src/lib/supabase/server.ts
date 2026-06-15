import { createClient } from "@supabase/supabase-js";

import { getSupabaseServerEnvironment } from "@/lib/env";
import { LOCAL_ORGANIZATION_ID } from "@/lib/local-data/seed";

export function createSupabaseServiceClient() {
  const environment = getSupabaseServerEnvironment();

  return createClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export function getDefaultOrganizationId() {
  if (process.env.DATA_SOURCE !== "supabase") {
    return LOCAL_ORGANIZATION_ID;
  }

  return getSupabaseServerEnvironment().DEFAULT_ORGANIZATION_ID;
}
