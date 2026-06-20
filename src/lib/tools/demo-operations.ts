import {
  CreateEmailDraftInputSchema,
  CreateWeeklyReportInputSchema,
  FindCalendarSlotsInputSchema,
  QuerySalesMetricsInputSchema,
  WatchMarketInputSchema,
} from "@/lib/contracts/tools";
import {
  localLeads,
  localMarketListings,
  localSales,
} from "@/lib/local-data/seed";
import {
  findGoogleCalendarAvailability,
  type StoredGoogleToken,
} from "@/lib/google/oauth";
import { generateEmailDraft } from "@/lib/gemini/client";
import { getDataSourceEnvironment } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { queryLeadMetrics } from "@/lib/tools/lead-metrics";
import { findIncompleteProperties } from "@/lib/tools/property-quality";

type MonthlyPerformance = {
  month: string;
  leads: number;
  soldProperties: number;
};

function monthKey(value: string) {
  return value.slice(0, 7);
}

function isWithinDateRange(value: string, from: string, to: string) {
  const date = new Date(value);
  return (
    date >= new Date(`${from}T00:00:00.000Z`) &&
    date <= new Date(`${to}T23:59:59.999Z`)
  );
}

export async function queryMonthlyPerformance(
  organizationId: string,
  rawInput: unknown,
): Promise<MonthlyPerformance[]> {
  const input = QuerySalesMetricsInputSchema.parse(rawInput);
  const dataSource = getDataSourceEnvironment();

  if (dataSource.DATA_SOURCE === "supabase") {
    const supabase = createSupabaseServiceClient();

    const [leadsResult, propertiesResult] = await Promise.all([
      supabase
        .from("leads")
        .select("created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", `${input.dateRange.from}T00:00:00.000Z`)
        .lte("created_at", `${input.dateRange.to}T23:59:59.999Z`),
      supabase
        .from("properties")
        .select("updated_at")
        .eq("organization_id", organizationId)
        .eq("status", "sold")
        .gte("updated_at", `${input.dateRange.from}T00:00:00.000Z`)
        .lte("updated_at", `${input.dateRange.to}T23:59:59.999Z`),
    ]);

    if (leadsResult.error) {
      throw new Error(`Failed to load leads: ${leadsResult.error.message}`);
    }
    if (propertiesResult.error) {
      throw new Error(`Failed to load sold properties: ${propertiesResult.error.message}`);
    }

    const grouped = new Map<string, MonthlyPerformance>();

    for (const row of (leadsResult.data ?? []) as Array<{ created_at: string }>) {
      const key = monthKey(row.created_at);
      const entry = grouped.get(key) ?? { month: key, leads: 0, soldProperties: 0 };
      entry.leads += 1;
      grouped.set(key, entry);
    }

    for (const row of (propertiesResult.data ?? []) as Array<{ updated_at: string }>) {
      const key = monthKey(row.updated_at);
      const entry = grouped.get(key) ?? { month: key, leads: 0, soldProperties: 0 };
      entry.soldProperties += 1;
      grouped.set(key, entry);
    }

    return [...grouped.values()].sort((a, b) => a.month.localeCompare(b.month));
  }

  const grouped = new Map<string, MonthlyPerformance>();

  for (const lead of localLeads) {
    if (
      lead.organizationId !== organizationId ||
      !isWithinDateRange(lead.createdAt, input.dateRange.from, input.dateRange.to)
    ) {
      continue;
    }

    const key = monthKey(lead.createdAt);
    const row = grouped.get(key) ?? {
      month: key,
      leads: 0,
      soldProperties: 0,
    };
    row.leads += 1;
    grouped.set(key, row);
  }

  for (const sale of localSales) {
    if (
      sale.organizationId !== organizationId ||
      !isWithinDateRange(sale.soldAt, input.dateRange.from, input.dateRange.to)
    ) {
      continue;
    }

    const key = monthKey(sale.soldAt);
    const row = grouped.get(key) ?? {
      month: key,
      leads: 0,
      soldProperties: 0,
    };
    row.soldProperties += 1;
    grouped.set(key, row);
  }

  return [...grouped.values()].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
}

export async function createViewingEmailDraft(
  rawInput: unknown,
  options?: { googleToken?: StoredGoogleToken | null },
) {
  const input = CreateEmailDraftInputSchema.parse(rawInput);
  const propertyTitle = input.propertyTitle ?? "nabizenou nemovitost";

  let availability = null;
  try {
    availability = await findGoogleCalendarAvailability(options?.googleToken, {
      dateRange: input.dateRange,
      durationMinutes: input.durationMinutes,
      timezone: input.timezone,
    });
  } catch {
    // treat as not connected
  }

  const calendarSlots = availability?.freeSlots ?? [];
  const recommendedSlot = calendarSlots[0] ?? null;

  const draft = await generateEmailDraft({
    propertyTitle,
    tone: input.tone ?? "formal",
    recommendedSlot: recommendedSlot?.label ?? null,
    alternativeSlots: calendarSlots.slice(1).map((slot) => slot.label),
    recipientEmail: input.recipientEmail,
    emailPurpose: input.emailPurpose,
  });

  return {
    recommendedSlot,
    subject: draft.subject,
    body: draft.body,
    recipientEmail: input.recipientEmail ?? "zajemce@example.com",
    source: recommendedSlot ? "google_calendar" : (availability ? "no_google_slots" : "not_connected"),
    alternatives: calendarSlots.slice(1),
    freeWindows: availability?.freeWindows ?? [],
    busySlots: availability?.busySlots ?? [],
  };
}

export async function findViewingSlots(
  rawInput: unknown,
  options?: { googleToken?: StoredGoogleToken | null },
) {
  const input = FindCalendarSlotsInputSchema.parse(rawInput);

  try {
    const availability = await findGoogleCalendarAvailability(
      options?.googleToken,
      input,
    );
    return {
      busySlots: availability?.busySlots ?? [],
      freeWindows: availability?.freeWindows ?? [],
      slots: availability?.freeSlots ?? [],
      source: availability ? "google_calendar" : "not_connected",
    };
  } catch {
    return { busySlots: [], freeWindows: [], slots: [], source: "not_connected" };
  }
}

export async function createWeeklyReport(
  rawInput: unknown,
  organizationId?: string,
) {
  const input = CreateWeeklyReportInputSchema.parse(rawInput);

  const now = new Date();
  const weekEndDate = input.weekStart
    ? new Date(`${input.weekStart}T23:59:59Z`)
    : now;
  const weekStartDate = new Date(weekEndDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dateRange = {
    from: weekStartDate.toISOString().slice(0, 10),
    to: weekEndDate.toISOString().slice(0, 10),
  };

  let totalLeads = 0;
  let topSource = "Sreality";
  let totalSold = 0;
  let incompleteCount = 0;

  if (organizationId) {
    try {
      const [leadMetrics, incompleteProps, salesData] = await Promise.all([
        queryLeadMetrics(organizationId, { dateRange, groupBy: "source" }),
        findIncompleteProperties(organizationId, {
          fields: ["reconstruction_year", "building_modifications", "energy_rating", "floor_area"],
        }),
        queryMonthlyPerformance(organizationId, { dateRange }),
      ]);

      totalLeads = leadMetrics.reduce((sum, m) => sum + m.count, 0);
      topSource = leadMetrics.sort((a, b) => b.count - a.count)[0]?.label ?? "Sreality";
      totalSold = salesData.reduce((sum, m) => sum + m.soldProperties, 0);
      incompleteCount = incompleteProps.length;
    } catch {
      totalLeads = 0;
      topSource = "Sreality";
      totalSold = 0;
      incompleteCount = 0;
    }
  }

  const soldText = totalSold === 1 ? "1 prodaná nemovitost" : `${totalSold} prodané nemovitosti`;
  const leadsText = totalLeads === 1 ? "1 nový lead" : `${totalLeads} nových leadů`;
  const incompleteText =
    incompleteCount === 0
      ? "žádné nemovitosti s chybějícími daty"
      : incompleteCount === 1
        ? "1 nemovitost vyžaduje doplnění dat"
        : `${incompleteCount} nemovitostí vyžaduje doplnění dat`;

  return {
    summary: `Minulý týden přinesl ${leadsText}, nejsilnější zdroj ${topSource}, ${soldText} a ${incompleteText}.`,
    slides: [
      {
        slide: 1,
        title: "Obchodní výkon",
        content: `${leadsText.charAt(0).toUpperCase() + leadsText.slice(1)}, nejsilnější zdroj ${topSource}, ${soldText}.`,
      },
      {
        slide: 2,
        title: "Operativní rizika",
        content:
          incompleteCount > 0
            ? `${incompleteCount} nemovitostí má nekompletní data, hlavně rekonstrukce a stavební úpravy.`
            : "Všechna data nemovitostí jsou aktuální. Žádné chybějící záznamy.",
      },
      {
        slide: 3,
        title: "Doporučené kroky",
        content:
          incompleteCount > 0
            ? `Doplnit technická data, kontaktovat nové leady do 24 hodin, potvrdit prohlídky.`
            : "Kontaktovat nové leady do 24 hodin, potvrdit naplánované prohlídky.",
      },
    ],
  };
}

export function watchMarket(rawInput: unknown) {
  const input = WatchMarketInputSchema.parse(rawInput);
  const locationQuery = (input.locationQuery ?? "").toLocaleLowerCase("cs-CZ");
  const listings = localMarketListings.filter((listing) =>
    listing.location.toLocaleLowerCase("cs-CZ").includes(locationQuery),
  );

  return {
    cadence: input.cadence,
    listings,
  };
}
