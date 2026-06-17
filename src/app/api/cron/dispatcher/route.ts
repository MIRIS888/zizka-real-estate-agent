import { NextResponse } from "next/server";

import { getActiveRulesForNow, markRuleAsRun } from "@/lib/tools/market-watch-schedule";
import { searchMarketListings } from "@/lib/tools/market-search";
import { loadGoogleAccount } from "@/lib/google/token-store";
import { sendGmailMessage } from "@/lib/google/oauth";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function buildEmailHtml(locationQuery: string, listings: { title: string; description: string; url: string; source: string }[]): string {
  const rows = listings
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px;border-bottom:1px solid #eee"><a href="${l.url}">${l.title}</a></td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:#666">${l.description}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;color:#999">${l.source}</td>
        </tr>`,
    )
    .join("");

  return `<h2>Nové nabídky – ${locationQuery}</h2>
<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px">
  <thead><tr>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Název</th>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Popis</th>
    <th style="text-align:left;padding:8px;background:#f5f5f5">Zdroj</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<p style="color:#999;font-size:12px;margin-top:16px">Automatický přehled ze Žižka Reality</p>`;
}

function buildEmailText(locationQuery: string, listings: { title: string; url: string }[]): string {
  const lines = listings.map((l) => `- ${l.title}: ${l.url}`).join("\n");
  return `Nové nabídky – ${locationQuery}\n\n${lines}\n\nAutomatický přehled ze Žižka Reality`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const rules = await getActiveRulesForNow();

  if (rules.length === 0) {
    return NextResponse.json({ dispatched: 0, reason: "no rules due now" });
  }

  const account = await loadGoogleAccount();
  const results: { ruleId: string; location: string; sent: boolean; listingCount: number }[] = [];

  for (const rule of rules) {
    await markRuleAsRun(rule.id);

    const search = await searchMarketListings({ locationQuery: rule.locationQuery });
    const listings = search.listings ?? [];
    const to = rule.recipientEmail ?? account?.email ?? null;

    if (account && to) {
      await sendGmailMessage(account.token, {
        to,
        subject: `Realitní přehled – ${rule.locationQuery} (${listings.length} nabídek)`,
        body: buildEmailText(rule.locationQuery, listings),
        html: buildEmailHtml(rule.locationQuery, listings),
      });
      results.push({ ruleId: rule.id, location: rule.locationQuery, sent: true, listingCount: listings.length });
    } else {
      results.push({ ruleId: rule.id, location: rule.locationQuery, sent: false, listingCount: listings.length });
    }
  }

  return NextResponse.json({ dispatched: results.length, results });
}
