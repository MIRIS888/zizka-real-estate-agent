import {
  CreateEmailDraftInputSchema,
  CreateWeeklyReportInputSchema,
  QuerySalesMetricsInputSchema,
  WatchMarketInputSchema,
} from "@/lib/contracts/tools";
import {
  localCalendarSlots,
  localLeads,
  localMarketListings,
  localSales,
} from "@/lib/local-data/seed";

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

export function createViewingEmailDraft(rawInput: unknown) {
  const input = CreateEmailDraftInputSchema.parse(rawInput);
  const recommendedSlot = localCalendarSlots[0];
  const propertyTitle = input.propertyTitle ?? "nabizenou nemovitost";
  const greeting =
    input.tone === "friendly" ? "Dobry den," : "Dobry den, vazeny zajemce,";

  return {
    recommendedSlot,
    subject: `Prohlidka nemovitosti: ${propertyTitle}`,
    body: `${greeting}

dekujeme za zajem o ${propertyTitle}. Podle aktualni dostupnosti navrhuji prohlidku v terminu ${recommendedSlot.label}.

Pokud se Vam termin nehodi, mohu nabidnout jeste ${localCalendarSlots
      .slice(1)
      .map((slot) => slot.label)
      .join(" nebo ")}.

Prosim o potvrzeni, ktery termin Vam vyhovuje.

S pozdravem
Back office tym`,
    recipientEmail: input.recipientEmail ?? "zajemce@example.com",
  };
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
  const locationQuery = input.locationQuery.toLocaleLowerCase("cs-CZ");
  const listings = localMarketListings.filter((listing) =>
    listing.location.toLocaleLowerCase("cs-CZ").includes(locationQuery),
  );

  return {
    cadence: input.cadence,
    listings,
  };
}
