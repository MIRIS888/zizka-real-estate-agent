import { QueryLeadMetricsInputSchema } from "@/lib/contracts/tools";
import { getDataSourceEnvironment } from "@/lib/env";
import { localClients } from "@/lib/local-data/seed";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { localizeLabel } from "@/lib/tools/label-maps";

type ClientMetricGroup = "month" | "source" | "status";

type ClientRow = {
  created_at: string;
  source?: string;
  status?: string;
};

export type ClientMetric = {
  label: string;
  count: number;
};

function getGroupLabel(row: ClientRow, groupBy: ClientMetricGroup) {
  if (groupBy === "month") return row.created_at.slice(0, 7);
  return localizeLabel(row[groupBy], groupBy);
}

export async function queryClientMetrics(
  organizationId: string,
  rawInput: unknown,
): Promise<ClientMetric[]> {
  const input = QueryLeadMetricsInputSchema.parse(rawInput);
  const dataSource = getDataSourceEnvironment();

  if (dataSource.DATA_SOURCE === "local") {
    const from = new Date(`${input.dateRange.from}T00:00:00.000Z`);
    const to = new Date(`${input.dateRange.to}T23:59:59.999Z`);
    const groupedCounts = new Map<string, number>();

    for (const client of localClients) {
      const createdAt = new Date(client.createdAt);
      if (
        client.organizationId !== organizationId ||
        createdAt < from ||
        createdAt > to
      ) {
        continue;
      }

      const row: ClientRow = {
        created_at: client.createdAt,
        source: client.source,
        status: client.status,
      };
      const label = getGroupLabel(row, input.groupBy);
      groupedCounts.set(label, (groupedCounts.get(label) ?? 0) + 1);
    }

    return [...groupedCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  const supabase = createSupabaseServiceClient();

  // Select only the column needed for grouping (plus created_at for month grouping).
  // Avoids querying columns that may not exist in all deployments (e.g. status).
  const groupCol = input.groupBy !== "month" ? input.groupBy : null;
  const selectCols = groupCol ? `created_at, ${groupCol}` : "created_at";

  const { data, error } = await supabase
    .from("clients")
    .select(selectCols)
    .eq("organization_id", organizationId)
    .gte("created_at", `${input.dateRange.from}T00:00:00.000Z`)
    .lte("created_at", `${input.dateRange.to}T23:59:59.999Z`);

  if (error) {
    throw new Error(`Failed to load client metrics: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as ClientRow[];
  const groupedCounts = new Map<string, number>();

  for (const row of rows) {
    const label = getGroupLabel(row, input.groupBy);
    groupedCounts.set(label, (groupedCounts.get(label) ?? 0) + 1);
  }

  return [...groupedCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
