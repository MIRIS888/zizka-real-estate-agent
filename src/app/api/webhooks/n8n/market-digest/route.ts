import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getN8nEnvironment } from "@/lib/env";
import {
  MarketDigestWebhookSchema,
  storeMarketDigest,
} from "@/lib/tools/market-digest";

function isAuthorized(request: Request) {
  const environment = getN8nEnvironment();
  const authorization = request.headers.get("authorization");

  return authorization === `Bearer ${environment.N8N_WEBHOOK_SECRET}`;
}

export async function POST(request: Request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized webhook." }, { status: 401 });
    }

    const payload = MarketDigestWebhookSchema.parse(await request.json());
    const result = await storeMarketDigest(payload);

    return NextResponse.json({
      accepted: true,
      digestRunId: result.digestRunId,
      message: `Stored ${result.listingCount} listings for ${payload.locationQuery}.`,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Webhook payload has invalid format." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unexpected webhook error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
