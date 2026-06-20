import { QueryLeadMetricsInputSchema } from "@/lib/contracts/tools";
import { getDataSourceEnvironment } from "@/lib/env";
import { localLeads } from "@/lib/local-data/seed";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { localizeLabel } from "@/lib/tools/label-maps";

type LeadMetricGroup = "month" | "source" | "status";

type LeadRow = {
  created_at: string;
  source: string;
  status: string;
};

export type LeadMetric = {
  label: string;
  count: number;
};

function getGroupLabel(row: LeadRow, groupBy: LeadMetricGroup) {
  if (groupBy === "month") return row.created_at.slice(0, 7);
  return localizeLabel(row[groupBy], groupBy);
}

export async function queryLeadMetrics(
  organizationId: string,
  rawInput: unknown,
): Promise<LeadMetric[]> {
  const input = QueryLeadMetricsInputSchema.parse(rawInput);
  const dataSource = getDataSourceEnvironment();

  if (dataSource.DATA_SOURCE === "local") {
    const from = new Date(`${input.dateRange.from}T00:00:00.000Z`);
    const to = new Date(`${input.dateRange.to}T23:59:59.999Z`);
    const groupedCounts = new Map<string, number>();

    for (const lead of localLeads) {
      const createdAt = new Date(lead.createdAt);
      if (
        lead.organizationId !== organizationId ||
        createdAt < from ||
        createdAt > to
      ) {
        continue;
      }

      const row: LeadRow = {
        created_at: lead.createdAt,
        source: lead.source,
        status: lead.status,
      };
      const label = getGroupLabel(row, input.groupBy);
      groupedCounts.set(label, (groupedCounts.get(label) ?? 0) + 1);
    }

    return [...groupedCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }

  const supabase = createSupabaseServiceClient();

  const { data, error } = await supabase
    .from("leads")
    .select("created_at, source, status")
    .eq("organization_id", organizationId)
    .gte("created_at", `${input.dateRange.from}T00:00:00.000Z`)
    .lte("created_at", `${input.dateRange.to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`Failed to load lead metrics: ${error.message}`);
  }

  const rows = (data ?? []) as LeadRow[];
  const groupedCounts = new Map<string, number>();

  for (const row of rows) {
    const label = getGroupLabel(row, input.groupBy);
    groupedCounts.set(label, (groupedCounts.get(label) ?? 0) + 1);
  }

  return [...groupedCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}
