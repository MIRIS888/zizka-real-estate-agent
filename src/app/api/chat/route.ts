import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";

import { ChatRequestSchema } from "@/lib/contracts/chat";
import { runAgent } from "@/lib/agent/run-agent";
import { checkRateLimit, getRateLimitKey } from "@/lib/agent/rate-limiter";
import { decodeGoogleToken, GOOGLE_TOKEN_COOKIE } from "@/lib/google/oauth";
import { getAuthUser } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  try {
    const requestBody: unknown = await request.json();
    const { message, history, confirmationToken, pendingTool } = ChatRequestSchema.parse(requestBody);

    // Rate limit before calling Gemini — per userId (preferred) or IP
    const user = await getAuthUser();
    const rateLimitKey = getRateLimitKey(request, user?.id);
    const { allowed, resetAt } = checkRateLimit(rateLimitKey);
    if (!allowed) {
      const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Příliš mnoho dotazů. Zkuste to prosím za ${retryAfterSec} sekund.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
      );
    }
    const cookieStore = await cookies();
    const googleToken = decodeGoogleToken(
      cookieStore.get(GOOGLE_TOKEN_COOKIE)?.value,
    );
    const response = await runAgent(message, {
      googleToken,
      history,
      userEmail: user?.email,
      userId: user?.id,
      confirmationToken,
      pendingTool,
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Požadavek nebo odpověď nemá platný formát." },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "Unexpected server error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
