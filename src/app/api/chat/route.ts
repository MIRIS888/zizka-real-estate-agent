import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ChatRequestSchema } from "@/lib/contracts/chat";
import { runAgent } from "@/lib/agent/run-agent";

export async function POST(request: Request) {
  try {
    const requestBody: unknown = await request.json();
    const { message } = ChatRequestSchema.parse(requestBody);
    const response = await runAgent(message);

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
