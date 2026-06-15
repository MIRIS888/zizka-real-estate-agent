import { type ChatResponse } from "@/lib/contracts/chat";
import {
  AgentPlanSchema,
  CreateEmailDraftInputSchema,
  CreateWeeklyReportInputSchema,
  FindIncompletePropertiesInputSchema,
  QueryLeadMetricsInputSchema,
  QuerySalesMetricsInputSchema,
  WatchMarketInputSchema,
  type AgentPlan,
} from "@/lib/contracts/tools";
import { generateAgentPlan } from "@/lib/gemini/client";
import { getDefaultOrganizationId } from "@/lib/supabase/server";
import {
  createViewingEmailDraft,
  createWeeklyReport,
  queryMonthlyPerformance,
  watchMarket,
} from "@/lib/tools/demo-operations";
import { queryLeadMetrics } from "@/lib/tools/lead-metrics";
import { findIncompleteProperties } from "@/lib/tools/property-quality";

function normalizeMessage(message: string) {
  return message
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function createDemoPlan(userMessage: string): Promise<AgentPlan> {
  const normalizedMessage = normalizeMessage(userMessage);

  if (
    normalizedMessage.includes("prodanych nemovitosti") ||
    normalizedMessage.includes("prodane nemovitosti") ||
    normalizedMessage.includes("poslednich 6 mesicu")
  ) {
    return {
      message: "Pripravim vyvoj leadu a prodanych nemovitosti.",
      intent: "analytics",
      toolName: "query_sales_metrics",
      toolInput: {
        dateRange: {
          from: "2026-01-01",
          to: "2026-06-30",
        },
      },
      requiresConfirmation: false,
    };
  }

  if (
    normalizedMessage.includes("1. kvartal") ||
    normalizedMessage.includes("prvni kvartal") ||
    normalizedMessage.includes("odkud prisli") ||
    normalizedMessage.includes("nove klienty")
  ) {
    return {
      message: "Zjistim nove klienty podle zdroje za prvni kvartal.",
      intent: "analytics",
      toolName: "query_lead_metrics",
      toolInput: {
        dateRange: {
          from: "2026-01-01",
          to: "2026-03-31",
        },
        groupBy: "source",
      },
      requiresConfirmation: false,
    };
  }

  if (
    normalizedMessage.includes("email") ||
    normalizedMessage.includes("e-mail") ||
    normalizedMessage.includes("prohlidky") ||
    normalizedMessage.includes("kalendar")
  ) {
    return {
      message: "Pripravim navrh e-mailu a doporucim termin prohlidky.",
      intent: "email",
      toolName: "create_email_draft",
      toolInput: {
        propertyTitle: "Byt 2+kk, Praha-Holesovice",
        tone: "formal",
      },
      requiresConfirmation: true,
    };
  }

  if (
    normalizedMessage.includes("report") ||
    normalizedMessage.includes("prezentaci") ||
    normalizedMessage.includes("slidy") ||
    normalizedMessage.includes("vedeni")
  ) {
    return {
      message: "Pripravim tydenni report a navrh tri slidu pro vedeni.",
      intent: "report",
      toolName: "create_weekly_report",
      toolInput: {
        weekStart: "2026-06-08",
        audience: "management",
      },
      requiresConfirmation: false,
    };
  }

  if (
    normalizedMessage.includes("sleduj") ||
    normalizedMessage.includes("realitni servery") ||
    normalizedMessage.includes("holesovice")
  ) {
    return {
      message: "Pripravim ranni monitoring novych nabidek.",
      intent: "market_watch",
      toolName: "watch_market",
      toolInput: {
        locationQuery: "Praha Holesovice",
        cadence: "daily",
      },
      requiresConfirmation: false,
    };
  }

  if (
    normalizedMessage.includes("rekonstrukci") ||
    normalizedMessage.includes("stavebnich upravach") ||
    normalizedMessage.includes("chybi data")
  ) {
    return {
      message: "Zkontroluji nemovitosti s chybejicimi technickymi udaji.",
      intent: "data_quality",
      toolName: "find_incomplete_properties",
      toolInput: {
        fields: ["reconstruction_year", "building_modifications"],
      },
      requiresConfirmation: false,
    };
  }

  return AgentPlanSchema.parse(await generateAgentPlan(userMessage));
}

export async function runAgent(userMessage: string): Promise<ChatResponse> {
  const plan = AgentPlanSchema.parse(await createDemoPlan(userMessage));

  if (plan.toolName === "query_lead_metrics") {
    const organizationId = getDefaultOrganizationId();
    const input = QueryLeadMetricsInputSchema.parse(plan.toolInput);
    const metrics = await queryLeadMetrics(organizationId, input);
    const total = metrics.reduce((sum, metric) => sum + metric.count, 0);

    return {
      intent: "analytics",
      requiresConfirmation: false,
      message:
        metrics.length > 0
          ? `Našel jsem ${total} leadů v daném období. Níže je agregace podle zvoleného členění.`
          : "V daném období jsem nenašel žádné leady.",
      artifact: {
        type: "chart",
        title: "Leady podle členění",
        xKey: "label",
        yKey: "count",
        data: metrics,
      },
    };
  }

  if (plan.toolName === "query_sales_metrics") {
    const organizationId = getDefaultOrganizationId();
    const input = QuerySalesMetricsInputSchema.parse(plan.toolInput);
    const metrics = queryMonthlyPerformance(organizationId, input);
    const totalLeads = metrics.reduce((sum, metric) => sum + metric.leads, 0);
    const totalSales = metrics.reduce(
      (sum, metric) => sum + metric.soldProperties,
      0,
    );

    return {
      intent: "analytics",
      requiresConfirmation: false,
      message: `Za sledovane obdobi eviduji ${totalLeads} leadu a ${totalSales} prodane nemovitosti. Graf ukazuje vyvoj po mesicich.`,
      artifact: {
        type: "chart",
        title: "Vyvoj leadu a prodanych nemovitosti",
        xKey: "month",
        yKeys: ["leads", "soldProperties"],
        data: metrics,
      },
    };
  }

  if (plan.toolName === "find_incomplete_properties") {
    const organizationId = getDefaultOrganizationId();
    const input = FindIncompletePropertiesInputSchema.parse(plan.toolInput);
    const properties = await findIncompleteProperties(organizationId, input);

    return {
      intent: "data_quality",
      requiresConfirmation: false,
      message:
        properties.length > 0
          ? `Našel jsem ${properties.length} nemovitostí s chybějícími údaji.`
          : "Nenašel jsem žádné nemovitosti s chybějícími údaji podle zadaných polí.",
      artifact: {
        type: "table",
        title: "Nemovitosti k doplnění",
        columns: ["title", "location", "missingFields"],
        rows: properties.map((property) => ({
          title: property.title,
          location: property.location,
          missingFields: property.missingFields.join(", "),
        })),
      },
    };
  }

  if (plan.toolName === "create_email_draft") {
    const input = CreateEmailDraftInputSchema.parse(plan.toolInput);
    const draft = createViewingEmailDraft(input);

    return {
      intent: "email",
      requiresConfirmation: true,
      message: `Doporuceny termin prohlidky je ${draft.recommendedSlot.label}. E-mail je pripraveny jako navrh a pred odeslanim vyzaduje potvrzeni.`,
      artifact: {
        type: "table",
        title: "Navrh e-mailu",
        columns: ["field", "value"],
        rows: [
          { field: "Komu", value: draft.recipientEmail },
          { field: "Predmet", value: draft.subject },
          { field: "Text", value: draft.body },
        ],
      },
    };
  }

  if (plan.toolName === "create_weekly_report") {
    const input = CreateWeeklyReportInputSchema.parse(plan.toolInput);
    const report = createWeeklyReport(input);

    return {
      intent: "report",
      requiresConfirmation: false,
      message: report.summary,
      artifact: {
        type: "table",
        title: "Prezentace pro vedeni - 3 slidy",
        columns: ["slide", "title", "content"],
        rows: report.slides,
      },
    };
  }

  if (plan.toolName === "watch_market") {
    const input = WatchMarketInputSchema.parse(plan.toolInput);
    const result = watchMarket(input);

    return {
      intent: "market_watch",
      requiresConfirmation: false,
      message: `Monitoring je pripraveny pro frekvenci ${result.cadence}. V dnesnim rannim souhrnu jsou ${result.listings.length} nove nabidky.`,
      artifact: {
        type: "table",
        title: "Nove nabidky v lokalite",
        columns: ["title", "price", "source", "url"],
        rows: result.listings.map((listing) => ({
          title: listing.title,
          price: listing.price,
          source: listing.source,
          url: listing.url,
        })),
      },
    };
  }

  return {
    message: plan.message,
    intent: plan.intent,
    requiresConfirmation: plan.requiresConfirmation,
  };
}
