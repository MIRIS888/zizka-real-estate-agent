import { getDefaultOrganizationId } from "@/lib/supabase/server";
import { queryLeadMetrics } from "@/lib/tools/lead-metrics";
import { findIncompleteProperties } from "@/lib/tools/property-quality";
import { searchMarketListings } from "@/lib/tools/market-search";

function formatDate(date: Date) {
  return date.toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Prague",
  });
}

function getLastWeekRange() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  return {
    from: weekAgo.toISOString().slice(0, 10),
    to: today.toISOString().slice(0, 10),
  };
}

type Listing = {
  title: string;
  description: string;
  source: string;
  url: string;
};

type IncompleteProperty = {
  title: string;
  location: string;
  missingFields: string[];
};

function buildPlainText(params: {
  date: string;
  totalLeads: number;
  incompleteCount: number;
  listings: Listing[];
}): string {
  const lines: string[] = [
    `RANNÍ REPORT — ${params.date}`,
    `${"=".repeat(50)}`,
    ``,
    `INTERNÍ PŘEHLED (posledních 7 dní)`,
    `Nové leady: ${params.totalLeads}`,
    `Nemovitosti k doplnění: ${params.incompleteCount}`,
    ``,
    `NABÍDKY V PRAZE`,
  ];

  if (params.listings.length === 0) {
    lines.push("Žádné výsledky ze Sreality / Bezrealitky dnes.");
  } else {
    params.listings.slice(0, 5).forEach((listing, index) => {
      lines.push(`${index + 1}. ${listing.title}`);
      lines.push(`   ${listing.source} — ${listing.url}`);
    });
  }

  lines.push(``, `Žižka Reality – automatický ranní přehled`);
  return lines.join("\n");
}

function buildHtml(params: {
  date: string;
  totalLeads: number;
  incompleteCount: number;
  listings: Listing[];
  incompleteProperties: IncompleteProperty[];
}): string {
  const listingRows = params.listings
    .slice(0, 5)
    .map(
      (l) =>
        `<tr>
          <td style="padding:8px 4px;border-bottom:1px solid #eee">
            <a href="${l.url}" style="color:#1a56db;text-decoration:none;font-weight:500">${l.title}</a><br>
            <span style="color:#6b7280;font-size:12px">${l.source}</span>
          </td>
        </tr>`,
    )
    .join("");

  const incompleteRows = params.incompleteProperties
    .slice(0, 5)
    .map(
      (p) =>
        `<tr>
          <td style="padding:6px 4px;border-bottom:1px solid #eee">
            <strong>${p.title}</strong> — ${p.location}<br>
            <span style="color:#6b7280;font-size:12px">Chybí: ${p.missingFields.join(", ")}</span>
          </td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f9fafb">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0">
    <tr><td>
      <table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1)">

        <!-- Header -->
        <tr>
          <td style="background:#1a56db;padding:24px 32px">
            <p style="margin:0;color:#bfdbfe;font-size:12px;text-transform:uppercase;letter-spacing:1px">Žižka Reality</p>
            <h1 style="margin:4px 0 0;color:#ffffff;font-size:22px;font-weight:700">Ranní report</h1>
            <p style="margin:4px 0 0;color:#93c5fd;font-size:14px">${params.date}</p>
          </td>
        </tr>

        <!-- Internal metrics -->
        <tr>
          <td style="padding:24px 32px">
            <h2 style="margin:0 0 16px;font-size:16px;color:#111827">📊 Interní přehled — posledních 7 dní</h2>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:50%;padding:12px 16px;background:#eff6ff;border-radius:6px;text-align:center">
                  <div style="font-size:28px;font-weight:700;color:#1a56db">${params.totalLeads}</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:4px">Nových leadů</div>
                </td>
                <td style="width:8px"></td>
                <td style="width:50%;padding:12px 16px;background:${params.incompleteCount > 0 ? "#fef3c7" : "#f0fdf4"};border-radius:6px;text-align:center">
                  <div style="font-size:28px;font-weight:700;color:${params.incompleteCount > 0 ? "#92400e" : "#166534"}">${params.incompleteCount}</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:4px">Nemovitostí k doplnění</div>
                </td>
              </tr>
            </table>

            ${
              params.incompleteProperties.length > 0
                ? `<div style="margin-top:16px">
                <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Nemovitosti vyžadující pozornost:</p>
                <table width="100%" cellpadding="0" cellspacing="0">${incompleteRows}</table>
              </div>`
                : ""
            }
          </td>
        </tr>

        <!-- Divider -->
        <tr><td style="height:1px;background:#f3f4f6"></td></tr>

        <!-- Market listings -->
        <tr>
          <td style="padding:24px 32px">
            <h2 style="margin:0 0 4px;font-size:16px;color:#111827">🏠 Nabídky v Praze dnes</h2>
            <p style="margin:0 0 16px;font-size:13px;color:#6b7280">Pouze prodej — Sreality, Bezrealitky, RE/MAX a další</p>
            ${
              params.listings.length === 0
                ? `<p style="color:#6b7280;font-size:14px">Dnes nebyly nalezeny žádné nové nabídky.</p>`
                : `<table width="100%" cellpadding="0" cellspacing="0">${listingRows}</table>`
            }
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #f3f4f6">
            <p style="margin:0;font-size:12px;color:#9ca3af">
              Automatický ranní přehled · Žižka Reality<br>
              Reporty lze kdykoliv spustit z chatu aplikace.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export type MorningReport = {
  date: string;
  totalLeads: number;
  incompleteCount: number;
  listingCount: number;
  subject: string;
  text: string;
  html: string;
};

export async function buildMorningReport(): Promise<MorningReport> {
  const organizationId = getDefaultOrganizationId();
  const dateRange = getLastWeekRange();

  const [leadMetrics, incompleteProperties, marketResult] = await Promise.all([
    queryLeadMetrics(organizationId, { dateRange, groupBy: "status" }),
    findIncompleteProperties(organizationId, {
      fields: ["reconstruction_year", "building_modifications", "energy_rating", "floor_area"],
    }),
    searchMarketListings({ locationQuery: "Praha" }),
  ]);

  const totalLeads = leadMetrics.reduce((sum, m) => sum + m.count, 0);
  const listings = marketResult.listings ?? [];
  const date = formatDate(new Date());

  return {
    date,
    totalLeads,
    incompleteCount: incompleteProperties.length,
    listingCount: listings.length,
    subject: `Ranní report — ${date}`,
    text: buildPlainText({ date, totalLeads, incompleteCount: incompleteProperties.length, listings }),
    html: buildHtml({ date, totalLeads, incompleteCount: incompleteProperties.length, listings, incompleteProperties }),
  };
}
