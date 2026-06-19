import { NextResponse } from "next/server";

import { getAuthUser } from "@/lib/supabase/auth-server";
import { listAllScheduledTasks } from "@/lib/tasks/scheduled-tasks";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

async function getGoogleEmail(userId: string): Promise<string | null> {
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("google_accounts")
    .select("email")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { email: string } | null)?.email ?? null;
}

type LastRun = {
  status: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

async function getLastRunsForTasks(taskIds: string[]): Promise<Record<string, LastRun>> {
  if (taskIds.length === 0) return {};
  const supabase = createSupabaseServiceClient();
  const { data } = await supabase
    .from("scheduled_task_runs")
    .select("task_id, status, started_at, finished_at, error_message")
    .in("task_id", taskIds)
    .order("started_at", { ascending: false });

  const map: Record<string, LastRun> = {};
  for (const row of data ?? []) {
    const r = row as { task_id: string } & LastRun;
    if (!map[r.task_id]) {
      map[r.task_id] = { status: r.status, started_at: r.started_at, finished_at: r.finished_at, error_message: r.error_message };
    }
  }
  return map;
}

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [tasks, googleEmail] = await Promise.all([
      listAllScheduledTasks(user.id),
      getGoogleEmail(user.id),
    ]);
    const lastRuns = await getLastRunsForTasks(tasks.map((t) => t.id));
    return NextResponse.json({
      tasks: tasks.map((t) => ({ ...t, last_run: lastRuns[t.id] ?? null })),
      googleEmail,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
