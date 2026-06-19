import { NextResponse } from "next/server";

// Legacy dispatcher for market_watch_rules — decommissioned.
// All market digest tasks are now in scheduled_tasks and run via /api/cron/run-due-tasks.

const GONE = {
  ok: false,
  message: "Legacy dispatcher is disabled. Use /api/cron/run-due-tasks.",
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
