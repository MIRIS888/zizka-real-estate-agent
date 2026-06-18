import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { getAuthUser, createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import type { ChatThread } from "@/lib/contracts/chat";

const CreateThreadBodySchema = z.object({
  title: z.string().max(100).optional(),
});

export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await createSupabaseAuthServerClient();
  const { data, error } = await client
    .from("chat_threads")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const threads = (data ?? []) as ChatThread[];
  return NextResponse.json({ threads });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const { title: rawTitle } = CreateThreadBodySchema.parse(body);
    const title =
      rawTitle && rawTitle.trim().length > 0
        ? rawTitle.trim()
        : "Nová konverzace";

    const client = await createSupabaseAuthServerClient();
    const { data, error } = await client
      .from("chat_threads")
      .insert({ user_id: user.id, title })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const thread = data as ChatThread;
    return NextResponse.json({ thread }, { status: 201 });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        { error: "Neplatný formát požadavku." },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
