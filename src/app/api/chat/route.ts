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
    const {
      message,
      history: requestHistory,
      confirmationToken,
      pendingTool,
      threadId: incomingThreadId,
    } = ChatRequestSchema.parse(requestBody);

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

    let threadId: string | undefined = incomingThreadId;
    let history: ChatHistoryItem[] = requestHistory ?? [];

    if (user) {
      const supabase = await createSupabaseAuthServerClient();

      if (threadId) {
        // Load history from DB — DB is the source of truth
        try {
          const { data, error } = await supabase
            .from("chat_messages")
            .select("role, content")
            .eq("thread_id", threadId)
            .order("created_at", { ascending: true });

          if (!error && data) {
            history = data.map((row) => ({
              role: row.role as "user" | "assistant",
              content: row.content as string,
            }));
          }
        } catch (err: unknown) {
          console.error("Failed to load chat history from DB:", err);
          // Fall back to request history
        }
      } else {
        // Auto-create a new thread
        try {
          const title =
            message.trim().length > 0
              ? message.trim().slice(0, 60)
              : "Nová konverzace";
          const { data, error } = await supabase
            .from("chat_threads")
            .insert({ user_id: user.id, title })
            .select("id")
            .single();

          if (!error && data) {
            threadId = data.id as string;
          }
        } catch (err: unknown) {
          console.error("Failed to create chat thread:", err);
        }
      }
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

    // Persist messages to DB after a successful agent response
    if (user && threadId) {
      try {
        const supabase = await createSupabaseAuthServerClient();
        await supabase.from("chat_messages").insert([
          { thread_id: threadId, role: "user", content: message },
          { thread_id: threadId, role: "assistant", content: response.message },
        ]);
        await supabase
          .from("chat_threads")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", threadId);
      } catch (err: unknown) {
        console.error("Failed to persist chat messages:", err);
        // Do not fail the response — agent reply takes priority
      }
    }

    return NextResponse.json({ ...response, threadId });
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
