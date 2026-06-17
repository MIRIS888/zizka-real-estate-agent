import { getDataSourceEnvironment } from "@/lib/env";
import {
  localCalendarSlots,
  localMarketListings,
  localSales,
} from "@/lib/local-data/seed";
import { createSupabaseServiceClient, getDefaultOrganizationId } from "@/lib/supabase/server";
import { type DailyReportWebhook } from "@/lib/tools/daily-report";
import { findIncompleteProperties } from "@/lib/tools/property-quality";
import { queryLeadMetrics } from "@/lib/tools/lead-metrics";

type DailyReportGenerationInput = {
  workflowId: string;
  reportDate: string;
  timezone?: string;
  executedAt?: string;
  delivery?: DailyReportWebhook["delivery"];
};

function dayBounds(reportDate: string) {
  return {
    from: `${reportDate}T00:00:00.000Z`,
    to: `${reportDate}T23:59:59.999Z`,
  };
}

function countByDate(items: { date: string }[], reportDate: string) {
  const { from, to } = dayBounds(reportDate);
  const fromDate = new Date(from);
  const toDate = new Date(to);

  return items.filter((item) => {
    const itemDate = new Date(item.date);
    return itemDate >= fromDate && itemDate <= toDate;
  }).length;
}

async function countSupabaseRows(
  table: string,
  reportDate: string,
  filters: Record<string, string>,
) {
  const organizationId = getDefaultOrganizationId();
  const { from, to } = dayBounds(reportDate);
  const supabase = createSupabaseServiceClient();
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("updated_at", from)
    .lte("updated_at", to);

  for (const [column, value] of Object.entries(filters)) {
    query = query.eq(column, value);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(`Failed to count ${table}: ${error.message}`);
  }

  return count ?? 0;
}

async function getDailyMetrics(reportDate: string) {
  const organizationId = getDefaultOrganizationId();
  const dataSource = getDataSourceEnvironment();
  const leadMetrics = await queryLeadMetrics(organizationId, {
    dateRange: { from: reportDate, to: reportDate },
    groupBy: "status",
  });
  const newLeads = leadMetrics.reduce((sum, metric) => sum + metric.count, 0);
  const incompleteProperties = await findIncompleteProperties(organizationId, {
    fields: ["reconstruction_year", "building_modifications"],
  });

  if (dataSource.DATA_SOURCE === "local") {
    return {
      newLeads,
      scheduledViewings: countByDate(
        localCalendarSlots.map((slot) => ({ date: slot.startsAt })),
        reportDate,
      ),
      soldProperties: countByDate(
        localSales.map((sale) => ({ date: sale.soldAt })),
        reportDate,
      ),
      incompleteProperties: incompleteProperties.length,
      newMarketListings: countByDate(
        localMarketListings.map((listing) => ({ date: listing.firstSeenAt })),
        reportDate,
      ),
    };
  }

  const [scheduledViewings, soldProperties] = await Promise.all([
    countSupabaseRows("leads", reportDate, { status: "viewing_scheduled" }),
    countSupabaseRows("properties", reportDate, { status: "sold" }),
  ]);

  return {
    newLeads,
    scheduledViewings,
    soldProperties,
    incompleteProperties: incompleteProperties.length,
    newMarketListings: 0,
  };
}

export async function generateDailyReportPayload(
  input: DailyReportGenerationInput,
): Promise<DailyReportWebhook> {
  const timezone = input.timezone ?? "Europe/Prague";
  const executedAt = input.executedAt ?? new Date().toISOString();
  const metrics = await getDailyMetrics(input.reportDate);
  const highlights = [
    `Nové leady za den: ${metrics.newLeads}.`,
    `Naplánované prohlídky: ${metrics.scheduledViewings}.`,
    `Nové tržní nabídky v monitoringu: ${metrics.newMarketListings}.`,
  ];
  const risks =
    metrics.incompleteProperties > 0
      ? [
          `${metrics.incompleteProperties} nemovitostí potřebuje doplnit technické údaje.`,
        ]
      : [];
  const nextActions = [
    "Zkontrolovat nové leady a rozdělit následné kroky.",
    "Potvrdit naplánované prohlídky s klienty.",
    "Doplnit chybějící technická data u aktivních nemovitostí.",
  ];

  return {
    workflowId: input.workflowId,
    reportDate: input.reportDate,
    timezone,
    executedAt,
    summary: `Denní report za ${input.reportDate}: ${metrics.newLeads} nových leadů, ${metrics.scheduledViewings} prohlídek, ${metrics.soldProperties} prodaných nemovitostí a ${metrics.incompleteProperties} nemovitostí k doplnění.`,
    metrics,
    highlights,
    risks,
    nextActions,
    delivery: input.delivery ?? { channel: "dashboard" },
  };
}
