import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthUser, createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ threads: data ?? [] });
}

const CreateThreadSchema = z.object({
  title: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: unknown = await request.json().catch(() => ({}));
  const { title } = CreateThreadSchema.parse(body);

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase
    .from("chat_threads")
    .insert({ user_id: user.id, title: title ?? "Nová konverzace" })
    .select("id, title, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to create thread" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
