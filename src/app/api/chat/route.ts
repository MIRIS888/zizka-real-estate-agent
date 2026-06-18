import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";

import { ChatRequestSchema, type ChatHistoryItem } from "@/lib/contracts/chat";
import { runAgent } from "@/lib/agent/run-agent";
import { checkRateLimit, getRateLimitKey } from "@/lib/agent/rate-limiter";
import { decodeGoogleToken, GOOGLE_TOKEN_COOKIE } from "@/lib/google/oauth";
import { getAuthUser, createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  try {
    const requestBody: unknown = await request.json();
    const { message, history, confirmationToken, pendingTool, threadId } =
      ChatRequestSchema.parse(requestBody);

    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimitKey = getRateLimitKey(request, user.id);
    const { allowed, resetAt } = checkRateLimit(rateLimitKey);
    if (!allowed) {
      const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Příliš mnoho dotazů. Zkuste to prosím za ${retryAfterSec} sekund.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
      );
    }

    const supabase = await createSupabaseAuthServerClient();

    // Resolve or create thread
    let resolvedThreadId = threadId;
    let chatHistory: ChatHistoryItem[] = history ?? [];

    if (resolvedThreadId) {
      // Verify thread belongs to user and load history
      const { data: thread, error: threadError } = await supabase
        .from("chat_threads")
        .select("id")
        .eq("id", resolvedThreadId)
        .eq("user_id", user.id)
        .is("archived_at", null)
        .single();

      if (threadError || !thread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }

      const { data: msgs } = await supabase
        .from("chat_messages")
        .select("role, content")
        .eq("thread_id", resolvedThreadId)
        .order("created_at", { ascending: true })
        .limit(20);

      if (msgs && msgs.length > 0) {
        chatHistory = (msgs as { role: string; content: string }[])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content.slice(0, 8_000),
          }));
      }
    } else {
      // Create new thread immediately (first message determines title)
      const title = message.trim().slice(0, 50);
      const { data: newThread } = await supabase
        .from("chat_threads")
        .insert({ user_id: user.id, title })
        .select("id")
        .single();
      resolvedThreadId = newThread?.id ?? undefined;
    }

    const cookieStore = await cookies();
    const googleToken = decodeGoogleToken(
      cookieStore.get(GOOGLE_TOKEN_COOKIE)?.value,
    );

    const response = await runAgent(message, {
      googleToken,
      history: chatHistory,
      userEmail: user.email,
      userId: user.id,
      confirmationToken,
      pendingTool,
      threadId: resolvedThreadId,
    });

    // Persist messages to DB (best-effort — never fail the response)
    if (resolvedThreadId) {
      try {
        const userContent = message;
        const assistantContent = JSON.stringify(response);

        await supabase.from("chat_messages").insert([
          {
            thread_id: resolvedThreadId,
            user_id: user.id,
            role: "user",
            content: userContent,
            metadata: {},
          },
          {
            thread_id: resolvedThreadId,
            user_id: user.id,
            role: "assistant",
            content: assistantContent,
            metadata: {
              intent: response.intent,
              requiresConfirmation: response.requiresConfirmation,
              hasArtifact: !!response.artifact,
            },
          },
        ]);

        await supabase
          .from("chat_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", resolvedThreadId)
          .eq("user_id", user.id);
      } catch {
        // Persistence errors must never break the chat response
      }
    }

    return NextResponse.json({ ...response, threadId: resolvedThreadId });
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
