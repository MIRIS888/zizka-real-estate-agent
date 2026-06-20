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
    let lastEmailDraft: { to: string | null; subject: string; body: string } | null = null;

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
        .select("role, content, metadata")
        .eq("thread_id", resolvedThreadId)
        .order("created_at", { ascending: true })
        .limit(20);

      type DbMessage = { role: string; content: string; metadata: Record<string, unknown> | null };

      if (msgs && msgs.length > 0) {
        chatHistory = (msgs as DbMessage[])
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => {
            let text = m.content;
            if (m.role === "assistant") {
              // Legacy rows stored JSON.stringify(ChatResponse) as content.
              // Extract just the message text so Gemini sees readable prose, not JSON.
              try {
                const raw = JSON.parse(text) as unknown;
                if (
                  typeof raw === "object" &&
                  raw !== null &&
                  "message" in raw &&
                  typeof (raw as Record<string, unknown>).message === "string"
                ) {
                  text = (raw as Record<string, unknown>).message as string;
                }
              } catch {
                // Already plain text — use as-is
              }
            }
            return { role: m.role as "user" | "assistant", content: text.slice(0, 8_000) };
          });

        // Extract last email draft from this thread (server-side source of truth).
        // Scoped strictly to resolvedThreadId — never reads from another thread.
        const lastDraftMsg = [...(msgs as DbMessage[])]
          .reverse()
          .find((m) => {
            if (m.role !== "assistant" || !m.metadata) return false;
            const draft = m.metadata.emailDraft as { subject?: unknown; body?: unknown } | null | undefined;
            return draft && typeof draft.subject === "string" && typeof draft.body === "string";
          });
        const rawDraft = lastDraftMsg?.metadata?.emailDraft as
          | { to?: string | null; subject: string; body: string }
          | undefined;
        if (rawDraft) {
          lastEmailDraft = {
            to: typeof rawDraft.to === "string" ? rawDraft.to : null,
            subject: rawDraft.subject,
            body: rawDraft.body,
          };
        }
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
      lastEmailDraft,
    });

    // Persist messages to DB (best-effort — never fail the response)
    if (resolvedThreadId) {
      try {
        await supabase.from("chat_messages").insert([
          {
            thread_id: resolvedThreadId,
            user_id: user.id,
            role: "user",
            content: message,
            metadata: {},
          },
          {
            thread_id: resolvedThreadId,
            user_id: user.id,
            role: "assistant",
            content: response.message,
            metadata: {
              intent: response.intent,
              requiresConfirmation: response.requiresConfirmation,
              source: response.source ?? null,
              artifact: response.artifact ?? null,
              artifacts: response.artifacts ?? null,
              emailDraft: response.emailDraft ?? null,
              generatedOutputs: response.generatedOutputs ?? null,
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
