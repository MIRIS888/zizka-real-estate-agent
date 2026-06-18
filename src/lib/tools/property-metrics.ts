import { QueryPropertyMetricsInputSchema } from "@/lib/contracts/tools";
import { getDataSourceEnvironment } from "@/lib/env";
import { localProperties } from "@/lib/local-data/seed";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

type PropertyGroupBy = "status" | "district" | "city";

type PropertyRow = {
  status: string;
  district: string | null;
  city: string | null;
};

export type PropertyMetric = {
  label: string;
  count: number;
};

function getGroupLabel(row: PropertyRow, groupBy: PropertyGroupBy): string {
  if (groupBy === "status") return row.status || "unknown";
  if (groupBy === "district") return row.district || row.city || "unknown";
  return row.city || "unknown";
}

const STATUS_LABELS: Record<string, string> = {
  active: "Aktivní",
  reserved: "Rezervováno",
  sold: "Prodáno",
  draft: "Návrh",
};

export async function queryPropertyMetrics(
  organizationId: string,
  rawInput: unknown,
): Promise<PropertyMetric[]> {
  const input = QueryPropertyMetricsInputSchema.parse(rawInput);
  const dataSource = getDataSourceEnvironment();

  if (dataSource.DATA_SOURCE === "local") {
    const grouped = new Map<string, number>();
    for (const p of localProperties) {
      if (p.organizationId !== organizationId) continue;
      const row: PropertyRow = {
        status: p.status,
        district: p.district ?? null,
        city: p.city ?? null,
      };
      const rawLabel = getGroupLabel(row, input.groupBy);
      const label =
        input.groupBy === "status" ? (STATUS_LABELS[rawLabel] ?? rawLabel) : rawLabel;
      grouped.set(label, (grouped.get(label) ?? 0) + 1);
    }
    return [...grouped.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("properties")
    .select("status, district, city")
    .eq("organization_id", organizationId);

  if (error) {
    throw new Error(`Failed to load property metrics: ${error.message}`);
  }

  const rows = (data ?? []) as PropertyRow[];
  const grouped = new Map<string, number>();

  for (const row of rows) {
    const rawLabel = getGroupLabel(row, input.groupBy);
    const label =
      input.groupBy === "status" ? (STATUS_LABELS[rawLabel] ?? rawLabel) : rawLabel;
    grouped.set(label, (grouped.get(label) ?? 0) + 1);
  }

  return [...grouped.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}
