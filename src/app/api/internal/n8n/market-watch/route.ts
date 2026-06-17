import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { getN8nEnvironment } from "@/lib/env";
import { searchMarketListings } from "@/lib/tools/market-search";
import { createSupabaseServiceClient, getDefaultOrganizationId } from "@/lib/supabase/server";

const MarketWatchRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  location_query: z.string(),
  schedule_days: z.array(z.number()).nullable(),
  schedule_time: z.string().nullable(),
  timezone: z.string().nullable(),
  recipient_email: z.string().nullable(),
});

const MarketSearchRequestSchema = z.object({
  locationQuery: z.string().min(1),
  ruleId: z.string().uuid().optional(),
});

function isAuthorized(request: Request) {
  const env = getN8nEnvironment();
  return request.headers.get("authorization") === `Bearer ${env.N8N_WEBHOOK_SECRET}`;
}

function getTodayIsoWeekday() {
  const day = new Date().getDay();
  return day === 0 ? 7 : day; // JS: 0=Sun → ISO: 7=Sun, 1-6 same
}

// GET /api/internal/n8n/market-watch
// n8n calls this every morning to find out which locations to search today
// Optional query param: ?day=2 (ISO weekday, 1=Mon…7=Sun) — defaults to today
export async function GET(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const url = new URL(request.url);
    const dayParam = url.searchParams.get("day");
    const weekday = dayParam ? parseInt(dayParam, 10) : getTodayIsoWeekday();
    const organizationId = getDefaultOrganizationId();
    const supabase = createSupabaseServiceClient();

    const { data, error } = await supabase
      .from("market_watch_rules")
      .select("id, name, location_query, schedule_days, schedule_time, timezone, recipient_email")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .contains("schedule_days", [weekday]);

    if (error) {
      return NextResponse.json({ error: `Database error: ${error.message}` }, { status: 500 });
    }

    const rules = (data ?? []).map((row) => MarketWatchRuleSchema.parse(row));

    return NextResponse.json({
      day: weekday,
      retrievedAt: new Date().toISOString(),
      count: rules.length,
      rules,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/internal/n8n/market-watch
// n8n calls this for each rule it received from GET above
// Body: { locationQuery: "Praha Holešovice", ruleId?: "uuid" }
// Returns: search results from Firecrawl — n8n then formats and emails them
export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const body = MarketSearchRequestSchema.parse(await request.json());
    const result = await searchMarketListings({ locationQuery: body.locationQuery });

    return NextResponse.json({
      ruleId: body.ruleId ?? null,
      locationQuery: body.locationQuery,
      searchedAt: new Date().toISOString(),
      configured: result.configured,
      count: result.listings?.length ?? 0,
      listings: result.listings ?? [],
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
