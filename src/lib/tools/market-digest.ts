import { z } from "zod";

import { createSupabaseServiceClient } from "@/lib/supabase/server";

export const MarketDigestWebhookSchema = z.object({
  workflowId: z.string().min(1),
  ruleId: z.uuid(),
  locationQuery: z.string().min(1),
  listings: z
    .array(
      z.object({
        externalId: z.string().min(1),
        title: z.string().min(1),
        url: z.url(),
        price: z.number().nonnegative().optional(),
        source: z.string().min(1),
      }),
    )
    .default([]),
  executedAt: z.string().datetime(),
});

export type MarketDigestWebhook = z.infer<typeof MarketDigestWebhookSchema>;

type MarketWatchRuleRow = {
  organization_id: string;
};

type DigestRunRow = {
  id: string;
};

export async function storeMarketDigest(payload: MarketDigestWebhook) {
  const supabase = createSupabaseServiceClient();

  const { data: rule, error: ruleError } = await supabase
    .from("market_watch_rules")
    .select("organization_id")
    .eq("id", payload.ruleId)
    .single();

  if (ruleError) {
    throw new Error(`Failed to load market watch rule: ${ruleError.message}`);
  }

  const marketWatchRule = rule as MarketWatchRuleRow;

  const { data: digestRun, error: digestError } = await supabase
    .from("market_digest_runs")
    .insert({
      organization_id: marketWatchRule.organization_id,
      market_watch_rule_id: payload.ruleId,
      n8n_workflow_id: payload.workflowId,
      location_query: payload.locationQuery,
      listing_count: payload.listings.length,
      executed_at: payload.executedAt,
    })
    .select("id")
    .single();

  if (digestError) {
    throw new Error(`Failed to store market digest: ${digestError.message}`);
  }

  const storedDigestRun = digestRun as DigestRunRow;

  if (payload.listings.length > 0) {
    const { error: listingsError } = await supabase
      .from("market_listings")
      .upsert(
        payload.listings.map((listing) => ({
          organization_id: marketWatchRule.organization_id,
          market_watch_rule_id: payload.ruleId,
          digest_run_id: storedDigestRun.id,
          external_id: listing.externalId,
          title: listing.title,
          url: listing.url,
          price: listing.price ?? null,
          source: listing.source,
          last_seen_at: payload.executedAt,
        })),
        { onConflict: "source,external_id" },
      );

    if (listingsError) {
      throw new Error(`Failed to store market listings: ${listingsError.message}`);
    }
  }

  return {
    digestRunId: storedDigestRun.id,
    listingCount: payload.listings.length,
  };
}
