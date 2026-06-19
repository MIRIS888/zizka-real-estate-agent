import { NextResponse } from "next/server";

// Morning report is now a scheduled_task of type 'morning_report'.
// The /api/cron/run-due-tasks endpoint processes it automatically.
// This endpoint is disabled to prevent duplicate sends.

const GONE = {
  ok: false,
  message: "This endpoint is disabled. Morning reports are now managed as scheduled tasks. Use /api/cron/run-due-tasks.",
};

export async function GET() {
  return NextResponse.json(GONE, { status: 410 });
}

export async function POST() {
  return NextResponse.json(GONE, { status: 410 });
}
