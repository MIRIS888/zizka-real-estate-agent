import { NextResponse } from "next/server";

import { isCronAuthorized } from "@/lib/cron/auth";
import { buildMorningReport } from "@/lib/tools/morning-report";
import { loadGoogleAccount } from "@/lib/google/token-store";
import { sendGmailMessage } from "@/lib/google/oauth";

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const account = await loadGoogleAccount();
  if (!account) {
    return NextResponse.json({
      sent: false,
      reason: "No Google account connected. Connect Google in the app first.",
    });
  }

  const report = await buildMorningReport();

  const { messageId } = await sendGmailMessage(account.token, {
    to: account.email,
    subject: report.subject,
    body: report.text,
    html: report.html,
  });

  return NextResponse.json({
    sent: true,
    to: account.email,
    subject: report.subject,
    messageId,
    stats: {
      totalLeads: report.totalLeads,
      incompleteCount: report.incompleteCount,
      listingCount: report.listingCount,
    },
  });
}
