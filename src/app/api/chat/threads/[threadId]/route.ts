import { NextResponse } from "next/server";

import { getAuthUser, createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const supabase = await createSupabaseAuthServerClient();

  const { data: thread, error: threadError } = await supabase
    .from("chat_threads")
    .select("id, title, created_at, updated_at")
    .eq("id", threadId)
    .eq("user_id", user.id)
    .is("archived_at", null)
    .single();

  if (threadError || !thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("chat_messages")
    .select("id, role, content, metadata, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ thread, messages: messages ?? [] });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId } = await params;
  const supabase = await createSupabaseAuthServerClient();

  const { count } = await supabase
    .from("chat_threads")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("user_id", user.id)
    .is("archived_at", null);

  if (!count) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
