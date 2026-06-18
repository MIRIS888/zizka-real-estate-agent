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

export function queryMonthlyPerformance(
  organizationId: string,
  rawInput: unknown,
): MonthlyPerformance[] {
  const input = QuerySalesMetricsInputSchema.parse(rawInput);
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

export function createWeeklyReport(rawInput: unknown) {
  CreateWeeklyReportInputSchema.parse(rawInput);

  return {
    summary:
      "Minuly tyden prinesl 8 novych leadu, 3 naplanovane prohlidky, 1 uzavreny prodej a 4 nemovitosti vyzaduji doplneni technickych udaju.",
    slides: [
      {
        slide: 1,
        title: "Obchodni vykon",
        content: "8 novych leadu, nejsilnejsi zdroj Sreality, 1 prodana nemovitost.",
      },
      {
        slide: 2,
        title: "Operativni rizika",
        content:
          "4 nemovitosti maji nekompletni data, hlavne rekonstrukce a stavebni upravy.",
      },
      {
        slide: 3,
        title: "Doporucene kroky",
        content:
          "Doplnit technicka data, kontaktovat nove leady do 24 hodin, potvrdit prohlidky.",
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
