import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";

import { ChatRequestSchema } from "@/lib/contracts/chat";
import { runAgent } from "@/lib/agent/run-agent";
import { decodeGoogleToken, GOOGLE_TOKEN_COOKIE } from "@/lib/google/oauth";

export async function POST(request: Request) {
  try {
    const requestBody: unknown = await request.json();
    const { message } = ChatRequestSchema.parse(requestBody);
    const cookieStore = await cookies();
    const googleToken = decodeGoogleToken(
      cookieStore.get(GOOGLE_TOKEN_COOKIE)?.value,
    );
    const response = await runAgent(message, { googleToken });

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
