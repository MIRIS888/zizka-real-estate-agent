import { NextResponse } from "next/server";

import { getAuthUser, createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import type { ChatThread, ChatMessage } from "@/lib/contracts/chat";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const client = await createSupabaseAuthServerClient();

  const { data: threadData, error: threadError } = await client
    .from("chat_threads")
    .select("id, user_id, title, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (threadError || !threadData) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const thread = threadData as ChatThread;

  const { data: messagesData, error: messagesError } = await client
    .from("chat_messages")
    .select("id, thread_id, role, content, created_at")
    .eq("thread_id", id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const messages = (messagesData ?? []) as ChatMessage[];
  return NextResponse.json({ thread, messages });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const client = await createSupabaseAuthServerClient();

  const { error, count } = await client
    .from("chat_threads")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!count) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
