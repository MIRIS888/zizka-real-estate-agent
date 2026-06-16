import { type ChatResponse, type ChatHistoryItem } from "@/lib/contracts/chat";
import {
  AgentPlanSchema,
  CreateEmailDraftInputSchema,
  CreateWeeklyReportInputSchema,
  FindCalendarSlotsInputSchema,
  FindIncompletePropertiesInputSchema,
  QueryLeadMetricsInputSchema,
  QuerySalesMetricsInputSchema,
  SendEmailInputSchema,
  WatchMarketInputSchema,
  type AgentPlan,
} from "@/lib/contracts/tools";
import { generateAgentPlan, generateToolResponse } from "@/lib/gemini/client";
import { getDataSourceEnvironment } from "@/lib/env";
import { getDefaultOrganizationId } from "@/lib/supabase/server";
import {
  createViewingEmailDraft,
  createWeeklyReport,
  findViewingSlots,
  queryMonthlyPerformance,
} from "@/lib/tools/demo-operations";
import { queryLeadMetrics } from "@/lib/tools/lead-metrics";
import { searchMarketListings } from "@/lib/tools/market-search";
import { findIncompleteProperties } from "@/lib/tools/property-quality";
import { sendGmailMessage, type StoredGoogleToken } from "@/lib/google/oauth";

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
}

function inferDateRangeFromMessage(userMessage: string) {
  const normalizedMessage = userMessage.toLocaleLowerCase("cs-CZ");
  const today = new Date();
  const explicitDateMatch = normalizedMessage.match(
    /\b(\d{1,2})\.\s*(\d{1,2})\.?(?:\s*(\d{4}))?\b/,
  );

  if (explicitDateMatch) {
    const day = Number(explicitDateMatch[1]);
    const month = Number(explicitDateMatch[2]);
    const year = explicitDateMatch[3]
      ? Number(explicitDateMatch[3])
      : today.getFullYear();
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const dateKey = formatDateKey(date);

    return { from: dateKey, to: dateKey };
  }

  if (normalizedMessage.includes("pozitri") || normalizedMessage.includes("pozítří")) {
    const dateKey = formatDateKey(addDays(today, 2));

    return { from: dateKey, to: dateKey };
  }

  if (normalizedMessage.includes("zitra") || normalizedMessage.includes("zítra")) {
    const dateKey = formatDateKey(addDays(today, 1));

    return { from: dateKey, to: dateKey };
  }

  if (normalizedMessage.includes("dnes")) {
    const dateKey = formatDateKey(today);

    return { from: dateKey, to: dateKey };
  }

  return null;
}

function withInferredCalendarRange<T extends { dateRange?: unknown; timezone?: string }>(
  userMessage: string,
  input: T,
) {
  const inferredDateRange = inferDateRangeFromMessage(userMessage);

  if (!inferredDateRange || input.dateRange) {
    return input;
  }

  return {
    ...input,
    dateRange: inferredDateRange,
    timezone: input.timezone ?? "Europe/Prague",
  };
}

function getDefaultCalendarDateRange() {
  const today = new Date();

  return {
    from: formatDateKey(today),
    to: formatDateKey(addDays(today, 7)),
  };
}

function getBusinessDataSource() {
  const dataSource = getDataSourceEnvironment();

  if (dataSource.DATA_SOURCE === "supabase") {
    return {
      label: "Supabase database",
      detail: "Odpověď je sestavená z tabulek Supabase podle aktuálního dotazu.",
      mode: "supabase" as const,
    };
  }

  return {
    label: "Lokální demo dataset",
    detail:
      "Odpověď je sestavená z ukázkových dat v src/lib/local-data/seed.ts, ne z reálného firemního systému.",
    mode: "local_demo" as const,
  };
}

const GOOGLE_CALENDAR_SOURCE = {
  label: "Google Calendar",
  detail:
    "Doporučený termín vychází z připojeného Google Calendar účtu přes FreeBusy API. E-mail je připravený jako návrh v aplikaci.",
  mode: "live" as const,
};

const LOCAL_REPORT_SOURCE = {
  label: "Ukázkový týdenní report",
  detail:
    "Report a slidy jsou vytvořené z demo provozních dat. Produkčně by se skládaly z CRM, obchodních tabulek a interních poznámek.",
  mode: "local_demo" as const,
};

const MARKET_WATCH_SOURCE = {
  label: "Realitní servery",
  detail:
    "Výsledky jsou hledané přes Firecrawl Search na veřejných realitních serverech.",
  mode: "planned_integration" as const,
};

async function createAgentPlan(
  userMessage: string,
  options?: { googleToken?: StoredGoogleToken | null; history?: ChatHistoryItem[] },
): Promise<AgentPlan> {
  return AgentPlanSchema.parse(
    await generateAgentPlan(userMessage, {
      currentDate: new Date().toISOString().slice(0, 10),
      googleCalendarConnected: Boolean(options?.googleToken),
      history: options?.history,
    }),
  );
}

function describeArtifact(artifact: ChatResponse["artifact"]): string | undefined {
  if (!artifact) return undefined;
  if (artifact.type === "chart") {
    return `Graf "${artifact.title}" bude zobrazen pod touto zprávou.`;
  }
  return `Tabulka "${artifact.title}" (sloupce: ${artifact.columns.join(", ")}) bude zobrazena pod touto zprávou.`;
}

async function withGeminiMessage(
  userMessage: string,
  plan: AgentPlan,
  response: Omit<ChatResponse, "message">,
  toolResult: unknown,
): Promise<ChatResponse> {
  const generated = await generateToolResponse({
    userMessage,
    plan,
    toolResult,
    artifactDescription: describeArtifact(response.artifact),
    currentDate: new Date().toISOString().slice(0, 10),
  });

  return {
    ...response,
    message: generated.message,
  };
}

export async function runAgent(
  userMessage: string,
  options?: { googleToken?: StoredGoogleToken | null; history?: ChatHistoryItem[] },
): Promise<ChatResponse> {
  const plan = AgentPlanSchema.parse(await createAgentPlan(userMessage, options));

  if (plan.toolName === "query_lead_metrics") {
    const organizationId = getDefaultOrganizationId();
    const input = QueryLeadMetricsInputSchema.parse(plan.toolInput);
    const metrics = await queryLeadMetrics(organizationId, input);
    const total = metrics.reduce((sum, metric) => sum + metric.count, 0);

    return withGeminiMessage(
      userMessage,
      plan,
      {
      intent: "analytics",
      requiresConfirmation: false,
      source: getBusinessDataSource(),
      artifact: {
        type: "chart",
        title: "Leady podle členění",
        xKey: "label",
        yKey: "count",
        data: metrics,
      },
      },
      { input, total, metrics },
    );
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

    return withGeminiMessage(
      userMessage,
      plan,
      {
      intent: "analytics",
      requiresConfirmation: false,
      source: getBusinessDataSource(),
      artifact: {
        type: "chart",
        title: "Vyvoj leadu a prodanych nemovitosti",
        xKey: "month",
        yKeys: ["leads", "soldProperties"],
        data: metrics,
      },
      },
      { input, totalLeads, totalSales, metrics },
    );
  }

  if (plan.toolName === "find_incomplete_properties") {
    const organizationId = getDefaultOrganizationId();
    const input = FindIncompletePropertiesInputSchema.parse(plan.toolInput);
    const properties = await findIncompleteProperties(organizationId, input);

    return withGeminiMessage(
      userMessage,
      plan,
      {
      intent: "data_quality",
      requiresConfirmation: false,
      source: getBusinessDataSource(),
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
      },
      { input, properties },
    );
  }

  if (plan.toolName === "find_calendar_slots") {
    const rawInput =
      typeof plan.toolInput === "object" && plan.toolInput !== null
        ? plan.toolInput
        : {};
    const input = FindCalendarSlotsInputSchema.parse({
      dateRange: getDefaultCalendarDateRange(),
      durationMinutes: 45,
      timezone: "Europe/Prague",
      ...withInferredCalendarRange(userMessage, rawInput),
    });
    const result = await findViewingSlots(input, {
      googleToken: options?.googleToken,
    });

    if (result.source !== "google_calendar") {
      return withGeminiMessage(
        userMessage,
        plan,
        {
        intent: "calendar",
        requiresConfirmation: false,
        source: {
          label: "Google Calendar není připojený",
          detail:
            "Pro čtení reálné dostupnosti je potřeba nejdřív připojit Google účet. Bez něj agent nebude vydávat demo sloty za skutečný kalendář.",
          mode: "planned_integration",
        },
        },
        { input, connected: false, slots: [] },
      );
    }

    return withGeminiMessage(
      userMessage,
      plan,
      {
      intent: "calendar",
      requiresConfirmation: false,
      source: GOOGLE_CALENDAR_SOURCE,
      artifact: {
        type: "table",
        title: "Google Calendar dostupnost",
        columns: ["type", "term", "startsAt", "endsAt"],
        rows: [
          ...result.busySlots.map((slot) => ({
            type: "obsazeno",
            term: slot.label,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
          })),
          ...result.freeWindows.map((slot) => ({
            type: "volno od-do",
            term: `${slot.label} (${slot.durationMinutes} min)`,
            startsAt: slot.startsAt,
            endsAt: slot.endsAt,
          })),
          ...result.slots.map((slot) => ({
            type: "volno",
            term: slot.label,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          })),
        ],
      },
      },
      {
        input,
        connected: true,
        busySlots: result.busySlots,
        freeWindows: result.freeWindows,
        freeSlots: result.slots,
      },
    );
  }

  if (plan.toolName === "create_email_draft") {
    if (!options?.googleToken) {
      return withGeminiMessage(
        userMessage,
        plan,
        {
        intent: "email",
        requiresConfirmation: false,
        source: {
          label: "Google Calendar není připojený",
          detail:
            "Agent nemůže doporučit termín podle skutečné dostupnosti bez připojeného Google účtu.",
          mode: "planned_integration",
        },
        },
        { connected: false, reason: "google_calendar_required" },
      );
    }

    const rawInput =
      typeof plan.toolInput === "object" && plan.toolInput !== null
        ? (plan.toolInput as Record<string, unknown>)
        : {};

    // Fallback: if planner missed the email address, extract it from the user's message
    const planEmail =
      typeof rawInput.recipientEmail === "string" ? rawInput.recipientEmail : undefined;
    const emailFromMessage =
      userMessage.match(/\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/)?.[0];
    const recipientEmail = planEmail ?? emailFromMessage;

    const input = CreateEmailDraftInputSchema.parse({
      durationMinutes: 45,
      timezone: "Europe/Prague",
      ...withInferredCalendarRange(userMessage, rawInput),
      ...(recipientEmail ? { recipientEmail } : {}),
    });
    const draft = await createViewingEmailDraft(input, {
      googleToken: options?.googleToken,
    });

    if (!draft.recommendedSlot) {
      return withGeminiMessage(
        userMessage,
        plan,
        {
          intent: "email",
          requiresConfirmation: false,
          source: GOOGLE_CALENDAR_SOURCE,
        },
        {
          input,
          draft,
          connected: true,
          reason: "no_available_google_calendar_slots",
        },
      );
    }

    return withGeminiMessage(
      userMessage,
      plan,
      {
      intent: "email",
      requiresConfirmation: true,
      source: GOOGLE_CALENDAR_SOURCE,
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
      },
      { input, draft },
    );
  }

  if (plan.toolName === "send_email") {
    if (!options?.googleToken) {
      return withGeminiMessage(
        userMessage,
        plan,
        {
          intent: "email",
          requiresConfirmation: false,
          source: {
            label: "Google účet není připojený",
            detail: "Pro odesílání e-mailů je potřeba připojit Google účet.",
            mode: "planned_integration",
          },
        },
        { sent: false, reason: "google_not_connected" },
      );
    }

    const input = SendEmailInputSchema.parse(plan.toolInput);
    const result = await sendGmailMessage(options.googleToken, {
      to: input.to,
      subject: input.subject,
      body: input.body,
    });

    return withGeminiMessage(
      userMessage,
      plan,
      {
        intent: "email",
        requiresConfirmation: false,
        source: {
          label: "Gmail",
          detail: `E-mail byl odeslán na ${input.to} přes Gmail API.`,
          mode: "live",
        },
      },
      { sent: true, messageId: result.messageId, to: input.to, subject: input.subject },
    );
  }

  if (plan.toolName === "create_weekly_report") {
    const input = CreateWeeklyReportInputSchema.parse(plan.toolInput);
    const report = createWeeklyReport(input);

    return withGeminiMessage(
      userMessage,
      plan,
      {
      intent: "report",
      requiresConfirmation: false,
      source: LOCAL_REPORT_SOURCE,
      artifact: {
        type: "table",
        title: "Prezentace pro vedeni - 3 slidy",
        columns: ["slide", "title", "content"],
        rows: report.slides,
      },
      },
      { input, report },
    );
  }

  if (plan.toolName === "watch_market") {
    const input = WatchMarketInputSchema.parse(plan.toolInput);
    const result = await searchMarketListings(input);

    const source = result.configured
      ? MARKET_WATCH_SOURCE
      : {
          label: "Firecrawl není nastavený",
          detail:
            "Pro živé hledání na realitních serverech je potřeba nastavit FIRECRAWL_API_KEY.",
          mode: "planned_integration" as const,
        };

    return withGeminiMessage(
      userMessage,
      plan,
      {
      intent: "market_watch",
      requiresConfirmation: false,
      source,
      artifact: {
        type: "table",
        title: "Výsledky z realitních serverů",
        columns: ["title", "description", "source", "url"],
        rows: result.listings.map((listing) => ({
          title: listing.title,
          description: listing.description,
          source: listing.source,
          url: listing.url,
        })),
      },
      },
      { input, result },
    );
  }

  return withGeminiMessage(
    userMessage,
    plan,
    {
    intent: plan.intent,
    requiresConfirmation: plan.requiresConfirmation,
    source: {
      label: "Agent plan",
      detail:
        "Odpověď vznikla plánováním agenta. Pro přesné provozní výstupy použijte jeden z připravených datových scénářů.",
      mode: "planned_integration",
    },
    },
    { plan },
  );
}
