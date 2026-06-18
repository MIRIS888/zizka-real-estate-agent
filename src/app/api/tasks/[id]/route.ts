import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/supabase/auth-server";
import {
  deleteScheduledTask,
  toggleScheduledTask,
} from "@/lib/tasks/scheduled-tasks";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    const body = (await request.json()) as { is_active?: boolean };
    if (typeof body.is_active !== "boolean") {
      return NextResponse.json({ error: "is_active required" }, { status: 400 });
    }
    await toggleScheduledTask(id, user.id, body.is_active);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    await deleteScheduledTask(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
