import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/supabase/auth-server";
import { listAllScheduledTasks } from "@/lib/tasks/scheduled-tasks";

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tasks = await listAllScheduledTasks(user.id);
    return NextResponse.json({ tasks });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
