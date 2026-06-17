import { z } from "zod";

import { WatchMarketInputSchema } from "@/lib/contracts/tools";
import { getDataSourceEnvironment } from "@/lib/env";
import {
  createSupabaseServiceClient,
  getDefaultOrganizationId,
} from "@/lib/supabase/server";

const DEFAULT_DAILY_DAYS = [1, 2, 3, 4, 5, 6, 7];
const DEFAULT_MORNING_TIME = "08:00";

const MarketWatchRuleRowSchema = z.object({
  id: z.string().uuid(),
  location_query: z.string(),
  schedule_days: z.array(z.number()).nullable().optional(),
  schedule_time: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  recipient_email: z.string().nullable().optional(),
});

const DAY_LABELS: Record<number, string> = {
  1: "pondělí",
  2: "úterý",
  3: "středu",
  4: "čtvrtek",
  5: "pátek",
  6: "sobotu",
  7: "neděli",
};

function normalizeScheduleDays(days: number[] | undefined, cadence: "daily" | "weekly") {
  if (days?.length) {
    return [...new Set(days)].sort((a, b) => a - b);
  }

  return cadence === "weekly" ? [1] : DEFAULT_DAILY_DAYS;
}

function describeDays(days: number[]) {
  if (days.length === 7) {
    return "každý den";
  }

  if (days.length === 5 && days.every((day, index) => day === index + 1)) {
    return "každý pracovní den";
  }

  return days.map((day) => DAY_LABELS[day] ?? String(day)).join(", ");
}

function buildRuleName(locationQuery: string) {
  return `Monitoring nabídek - ${locationQuery}`;
}

async function findExistingRule(organizationId: string, locationQuery?: string) {
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from("market_watch_rules")
    .select("id, location_query, schedule_days, schedule_time, timezone, recipient_email")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (locationQuery) {
    query = query.ilike("location_query", locationQuery);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to load market watch rule: ${error.message}`);
  }

  return data ? MarketWatchRuleRowSchema.parse(data) : null;
}

export async function upsertMarketWatchRule(
  rawInput: unknown,
  options: { recipientEmail?: string | null } = {},
) {
  const input = WatchMarketInputSchema.parse(rawInput);
  const organizationId = getDefaultOrganizationId();
  const dataSource = getDataSourceEnvironment();
  const existingRule = dataSource.DATA_SOURCE === "supabase"
    ? await findExistingRule(organizationId, input.locationQuery)
    : null;
  const locationQuery = input.locationQuery ?? existingRule?.location_query;

  if (!locationQuery) {
    throw new Error("Chybí lokalita pro monitoring nabídek.");
  }

  const scheduleDays = normalizeScheduleDays(input.scheduleDays, input.cadence);
  const scheduleTime = input.scheduleTime ?? DEFAULT_MORNING_TIME;
  const timezone = input.timezone;
  const recipientEmail = options.recipientEmail ?? existingRule?.recipient_email ?? null;

  if (dataSource.DATA_SOURCE !== "supabase") {
    return {
      stored: false,
      ruleId: null,
      locationQuery,
      scheduleDays,
      scheduleTime,
      timezone,
      recipientEmail,
      scheduleLabel: `${describeDays(scheduleDays)} v ${scheduleTime}`,
      message: "Monitoring je připravený. Pro trvalé uložení nastav DATA_SOURCE=supabase.",
    };
  }

  const supabase = createSupabaseServiceClient();
  const payload = {
    organization_id: organizationId,
    name: buildRuleName(locationQuery),
    location_query: locationQuery,
    filters: { transactionType: "sale" },
    is_active: true,
    n8n_workflow_id: "n8n-market-watch-digest",
    schedule_days: scheduleDays,
    schedule_time: scheduleTime,
    timezone,
    recipient_email: recipientEmail,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = existingRule
    ? await supabase
        .from("market_watch_rules")
        .update(payload)
        .eq("id", existingRule.id)
        .select("id")
        .single()
    : await supabase
        .from("market_watch_rules")
        .insert(payload)
        .select("id")
        .single();

  if (error) {
    throw new Error(`Failed to save market watch rule: ${error.message}`);
  }

  const rule = z.object({ id: z.string().uuid() }).parse(data);

  return {
    stored: true,
    ruleId: rule.id,
    locationQuery,
    scheduleDays,
    scheduleTime,
    timezone,
    recipientEmail,
    scheduleLabel: `${describeDays(scheduleDays)} v ${scheduleTime}`,
    message: existingRule
      ? "Monitoring nabídek byl aktualizovaný."
      : "Monitoring nabídek byl nastavený.",
  };
}

export type ActiveMarketWatchRule = {
  id: string;
  locationQuery: string;
  recipientEmail: string | null;
};

function getCurrentHourInTimezone(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart?.value ?? 0);
}

function getCurrentIsoWeekday(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).formatToParts(new Date());
  const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const map: Record<string, number> = {
    Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return map[weekdayStr] ?? 1;
}

function ruleMatchesNow(rule: {
  schedule_days: number[] | null;
  schedule_time: string | null;
  timezone: string | null;
}): boolean {
  const timezone = rule.timezone ?? "Europe/Prague";
  const scheduleTime = rule.schedule_time ?? "08:00";
  const scheduledHour = Number(scheduleTime.split(":")[0]);
  const currentHour = getCurrentHourInTimezone(timezone);
  const currentWeekday = getCurrentIsoWeekday(timezone);
  const days = rule.schedule_days ?? [1, 2, 3, 4, 5, 6, 7];
  return currentHour === scheduledHour && days.includes(currentWeekday);
}

const ActiveRuleRowSchema = z.object({
  id: z.string().uuid(),
  location_query: z.string(),
  schedule_days: z.array(z.number()).nullable(),
  schedule_time: z.string().nullable(),
  timezone: z.string().nullable(),
  recipient_email: z.string().nullable(),
  last_run_at: z.string().nullable(),
});

export async function getActiveRulesForNow(): Promise<ActiveMarketWatchRule[]> {
  const dataSource = getDataSourceEnvironment();
  if (dataSource.DATA_SOURCE !== "supabase") return [];

  const supabase = createSupabaseServiceClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("market_watch_rules")
    .select("id, location_query, schedule_days, schedule_time, timezone, recipient_email, last_run_at")
    .eq("is_active", true)
    .or(`last_run_at.is.null,last_run_at.lt.${oneHourAgo}`);

  if (error) throw new Error(`Failed to load market watch rules: ${error.message}`);

  return (data ?? [])
    .map((row) => ActiveRuleRowSchema.parse(row))
    .filter(ruleMatchesNow)
    .map((row) => ({
      id: row.id,
      locationQuery: row.location_query,
      recipientEmail: row.recipient_email,
    }));
}

export async function markRuleAsRun(ruleId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("market_watch_rules")
    .update({ last_run_at: new Date().toISOString() })
    .eq("id", ruleId);

  if (error) throw new Error(`Failed to mark rule as run: ${error.message}`);
}
