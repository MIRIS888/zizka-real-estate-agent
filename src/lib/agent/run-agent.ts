import { type ChatResponse, type ChatHistoryItem } from "@/lib/contracts/chat";
import {
  CreateEmailDraftInputSchema,
  CreateWeeklyReportInputSchema,
  FindCalendarSlotsInputSchema,
  FindIncompletePropertiesInputSchema,
  QueryLeadMetricsInputSchema,
  QuerySalesMetricsInputSchema,
  SendMorningReportInputSchema,
  SendEmailInputSchema,
  WatchMarketInputSchema,
  CreateScheduledTaskAgentInputSchema,
  UpdateScheduledTaskAgentInputSchema,
  DeleteScheduledTaskAgentInputSchema,
  type AgentToolName,
} from "@/lib/contracts/tools";
import {
  createScheduledTask,
  listScheduledTasks,
  updateScheduledTask,
  deleteScheduledTask,
} from "@/lib/tasks/scheduled-tasks";
import {
  CONVERSATIONAL_SYSTEM_INSTRUCTION,
  createFunctionResponseContent,
  createGeminiClient,
  getFunctionCallingConfig,
  getFunctionCalls,
} from "@/lib/gemini/client";
import { getDataSourceEnvironment, isGeminiConfigured } from "@/lib/env";
import { getDefaultOrganizationId } from "@/lib/supabase/server";
import {
  createViewingEmailDraft,
  createWeeklyReport,
  findViewingSlots,
  queryMonthlyPerformance,
} from "@/lib/tools/demo-operations";
import { queryLeadMetrics } from "@/lib/tools/lead-metrics";
import { searchMarketListings } from "@/lib/tools/market-search";
import { upsertMarketWatchRule } from "@/lib/tools/market-watch-schedule";
import { buildMorningReport } from "@/lib/tools/morning-report";
import { findIncompleteProperties } from "@/lib/tools/property-quality";
import { sendGmailMessage, type StoredGoogleToken } from "@/lib/google/oauth";
import { type Content, type FunctionCall } from "@google/genai";

const MAX_AGENT_ITERATIONS = 6;

type ToolExecution = {
  toolName: AgentToolName;
  toolInput: unknown;
  result: unknown;
  isMock: boolean;
  isEmpty: boolean;
  response: Omit<ChatResponse, "message">;
};

type FunctionToolCall = {
  toolName: AgentToolName;
  toolInput: unknown;
  id?: string;
};

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

function getDefaultSixMonthDateRange() {
  const today = new Date();
  const from = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 5, 1, 12, 0, 0));

  return {
    from: formatDateKey(from),
    to: formatDateKey(today),
  };
}

function normalizeDateRange(value: unknown) {
  if (typeof value !== "object" || value === null) {
    return getDefaultSixMonthDateRange();
  }

  const record = value as Record<string, unknown>;

  if (typeof record.from === "string" && typeof record.to === "string") {
    return {
      from: record.from,
      to: record.to,
    };
  }

  return getDefaultSixMonthDateRange();
}

function normalizeLeadGroupBy(value: unknown): "month" | "source" | "status" {
  return value === "source" || value === "status" || value === "month"
    ? value
    : "month";
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

const MORNING_REPORT_SOURCE = {
  label: "Ranní report",
  detail: "Report je sestavený z interních dat a realitních serverů a odeslán přes Gmail API.",
  mode: "live" as const,
};

const MARKET_WATCH_SOURCE = {
  label: "Realitní servery",
  detail:
    "Výsledky jsou živě hledané přes Firecrawl Search na hlavních veřejných realitních serverech.",
  mode: "live" as const,
};

function getLatestExecution(executions: ToolExecution[]) {
  return executions.at(-1);
}

function getAllArtifacts(executions: ToolExecution[]) {
  return executions.flatMap((execution) => {
    const artifacts = execution.response.artifacts
      ?? (execution.response.artifact ? [execution.response.artifact] : []);

    return artifacts;
  });
}

function stableStringify(value: unknown) {
  return JSON.stringify(value, Object.keys((value ?? {}) as Record<string, unknown>).sort());
}

function hasAlreadyRunAction(executions: ToolExecution[], action: FunctionToolCall) {
  const actionInput = stableStringify(action.toolInput ?? {});

  return executions.some(
    (execution) =>
      execution.toolName === action.toolName &&
      stableStringify(execution.toolInput ?? {}) === actionInput,
  );
}

function createFunctionToolCall(functionCall: FunctionCall): FunctionToolCall {
  const toolName = functionCall.name;
  const allowedToolNames: AgentToolName[] = [
    "query_lead_metrics",
    "query_sales_metrics",
    "find_incomplete_properties",
    "find_calendar_slots",
    "create_email_draft",
    "send_email",
    "create_weekly_report",
    "send_morning_report",
    "watch_market",
    "create_scheduled_task",
    "list_scheduled_tasks",
    "update_scheduled_task",
    "delete_scheduled_task",
  ];

  if (!toolName || !allowedToolNames.includes(toolName as AgentToolName)) {
    throw new Error(`Unsupported Gemini function call: ${toolName ?? "unknown"}`);
  }

  return {
    toolName: toolName as AgentToolName,
    toolInput: functionCall.args ?? {},
    id: functionCall.id,
  };
}

function isConfirmationMessage(userMessage: string) {
  const normalized = userMessage.toLocaleLowerCase("cs-CZ");

  return [
    "ano",
    "pošli",
    "posli",
    "potvrzuji",
    "potvrdit",
    "souhlas",
    "ok",
    "odešli",
    "odesli",
  ].some((phrase) => normalized.includes(phrase));
}

function hasPendingConfirmation(history?: ChatHistoryItem[]) {
  const lastAssistantMessage = [...(history ?? [])]
    .reverse()
    .find((item) => item.role === "assistant");

  if (!lastAssistantMessage) return false;

  const normalized = lastAssistantMessage.content.toLocaleLowerCase("cs-CZ");

  return (
    normalized.includes("potvr") ||
    normalized.includes("souhlas") ||
    normalized.includes("po potvrzení") ||
    normalized.includes("po potvrzeni")
  );
}

const ALWAYS_CONSEQUENTIAL = new Set<string>([
  "send_email",
  "send_morning_report",
  "create_scheduled_task",
  "update_scheduled_task",
  "delete_scheduled_task",
]);

function isConsequentialAction(action: FunctionToolCall): boolean {
  if (ALWAYS_CONSEQUENTIAL.has(action.toolName)) return true;

  if (action.toolName === "watch_market") {
    const parsed = WatchMarketInputSchema.safeParse(action.toolInput);
    return parsed.success && parsed.data.mode === "schedule";
  }

  return false;
}

function userConfirmedPendingAction(userMessage: string, history?: ChatHistoryItem[]) {
  return isConfirmationMessage(userMessage) && hasPendingConfirmation(history);
}

function asksForSending(userMessage: string) {
  const normalized = userMessage.toLocaleLowerCase("cs-CZ");

  return [
    "pošli",
    "posli",
    "odešli",
    "odesli",
    "zašli",
    "zasli",
    "send",
    "e-mail",
    "email",
  ].some((phrase) => normalized.includes(phrase));
}

function needsConfirmationBeforeFinish(
  userMessage: string,
  executions: ToolExecution[],
  history?: ChatHistoryItem[],
) {
  if (userConfirmedPendingAction(userMessage, history)) return false;
  if (!asksForSending(userMessage)) return false;

  const latestExecution = getLatestExecution(executions);

  return (
    latestExecution?.toolName === "create_weekly_report" ||
    latestExecution?.toolName === "create_email_draft"
  );
}

function buildConfirmationMessage(action: FunctionToolCall) {
  if (action.toolName === "send_email") {
    return "Chystám se odeslat e-mail podle předchozího návrhu. Potvrďte prosím odpovědí ’ano pošli’.";
  }

  if (action.toolName === "send_morning_report") {
    return "Chystám se odeslat ranní report e-mailem. Potvrďte prosím odpovědí ’ano pošli’.";
  }

  if (action.toolName === "watch_market") {
    return "Chystám se založit pravidelný monitoring realitních nabídek. Potvrďte prosím odpovědí ’ano, založ monitoring’.";
  }

  if (action.toolName === "create_scheduled_task") {
    const raw = action.toolInput as Record<string, unknown>;
    const location = typeof raw.location === "string" ? raw.location : "vybraná lokalita";
    const time = typeof raw.schedule_time === "string" ? raw.schedule_time : "nastavenou dobu";
    return `Chystám se nastavit denní automatický přehled nabídek z **${location}** každý den v **${time}**. Úloha se uloží a bude vám chodit e-mailem. Potvrďte prosím odpovědí ’ano založ’.`;
  }

  if (action.toolName === "update_scheduled_task") {
    const raw = action.toolInput as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof raw.location === "string") parts.push(`lokalita: **${raw.location}**`);
    if (typeof raw.schedule_time === "string") parts.push(`čas: **${raw.schedule_time}**`);
    if (typeof raw.transaction === "string") parts.push(`typ: **${raw.transaction === "rent" ? "pronájem" : "prodej"}**`);
    const changes = parts.length > 0 ? parts.join(", ") : "parametry úlohy";
    return `Chystám se upravit naplánovanou úlohu — nové nastavení: ${changes}. Potvrďte prosím odpovědí ‘ano uprav’.`;
  }

  if (action.toolName === "delete_scheduled_task") {
    const raw = action.toolInput as Record<string, unknown>;
    const desc = typeof raw.description === "string" ? raw.description : "tuto naplánovanou úlohu";
    return `Opravdu smazat: **${desc}**? Po smazání vám přestanou chodit automatické přehledy. Potvrďte prosím odpovědí ‘ano smaž’.`;
  }

  return "Tento krok má vedlejší efekt. Potvrďte prosím, že ho mám provést.";
}

function buildFinishConfirmationMessage(userMessage: string, executions: ToolExecution[]) {
  const latestExecution = getLatestExecution(executions);

  if (latestExecution?.toolName === "create_weekly_report") {
    const result = latestExecution.result as {
      report?: {
        summary?: string;
        slides?: Array<{ slide: number; title: string; content: string }>;
      };
    };
    const summary = result.report?.summary ?? "Týdenní report je připravený.";
    const slideSummary = (result.report?.slides ?? [])
      .map((slide) => `Slide ${slide.slide}: ${slide.title} — ${slide.content}`)
      .join("\n");
    const body = [summary, slideSummary].filter(Boolean).join("\n\n");

    return [
      "Týdenní report je připravený.",
      "Než ho odešlu, potřebuji potvrzení, protože odeslání e-mailu je vedlejší efekt.",
      "Po potvrzení odešlu tento e-mail:",
      "Komu: `vedeni@example.com`",
      "Předmět: `Týdenní report pro vedení`",
      `Text:\n${body}`,
      "Potvrďte prosím odpovědí 'ano pošli'.",
    ].join("\n\n");
  }

  if (latestExecution?.toolName === "create_email_draft") {
    return [
      "Návrh e-mailu je připravený.",
      "Než ho odešlu, potřebuji potvrzení.",
      "Potvrďte prosím odpovědí 'ano pošli'.",
    ].join("\n\n");
  }

  return `Úkol vyžaduje potvrzení před pokračováním: ${userMessage}`;
}

function createTextResponse(
  message: string,
  executions: ToolExecution[],
): ChatResponse {
  const latestExecution = getLatestExecution(executions);
  const artifacts = getAllArtifacts(executions);

  return {
    intent: latestExecution?.response.intent ?? "general",
    requiresConfirmation: false,
    source: latestExecution?.response.source,
    emailDraft: latestExecution?.response.emailDraft,
    artifact: latestExecution?.response.artifact,
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    generatedOutputs: latestExecution?.response.generatedOutputs,
    message,
  };
}

async function executeToolAction(
  userMessage: string,
  action: FunctionToolCall,
  options?: {
    googleToken?: StoredGoogleToken | null;
    userEmail?: string;
    userId?: string;
  },
): Promise<ToolExecution> {
  if (action.toolName === "query_lead_metrics") {
    const organizationId = getDefaultOrganizationId();
    const rawInput =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? (action.toolInput as { dateRange?: unknown; groupBy?: unknown })
        : {};
    const input = QueryLeadMetricsInputSchema.parse(
      {
        groupBy: normalizeLeadGroupBy(rawInput.groupBy),
        dateRange: normalizeDateRange(rawInput.dateRange),
      },
    );
    const metrics = await queryLeadMetrics(organizationId, input);
    const total = metrics.reduce((sum, metric) => sum + metric.count, 0);
    const isMock = getDataSourceEnvironment().DATA_SOURCE === "local";
    const result = { input, total, metrics, isMock, isEmpty: metrics.length === 0 };

    return {
      toolName: action.toolName,
      toolInput: input,
      result,
      isMock,
      isEmpty: metrics.length === 0,
      response: {
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
    };
  }

  if (action.toolName === "query_sales_metrics") {
    const organizationId = getDefaultOrganizationId();
    const rawInput =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? (action.toolInput as { dateRange?: unknown })
        : {};
    const input = QuerySalesMetricsInputSchema.parse({
      dateRange: normalizeDateRange(rawInput.dateRange),
    });
    const metrics = queryMonthlyPerformance(organizationId, input);
    const totalLeads = metrics.reduce((sum, metric) => sum + metric.leads, 0);
    const totalSales = metrics.reduce(
      (sum, metric) => sum + metric.soldProperties,
      0,
    );
    const isMock = getDataSourceEnvironment().DATA_SOURCE === "local";
    const result = {
      input,
      totalLeads,
      totalSales,
      metrics,
      isMock,
      isEmpty: metrics.length === 0,
    };

    return {
      toolName: action.toolName,
      toolInput: input,
      result,
      isMock,
      isEmpty: metrics.length === 0,
      response: {
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
    };
  }

  if (action.toolName === "find_incomplete_properties") {
    const organizationId = getDefaultOrganizationId();
    const input = FindIncompletePropertiesInputSchema.parse(action.toolInput);
    const properties = await findIncompleteProperties(organizationId, input);
    const isMock = getDataSourceEnvironment().DATA_SOURCE === "local";
    const result = { input, properties, isMock, isEmpty: properties.length === 0 };

    return {
      toolName: action.toolName,
      toolInput: input,
      result,
      isMock,
      isEmpty: properties.length === 0,
      response: {
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
    };
  }

  if (action.toolName === "find_calendar_slots") {
    const rawInput =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? action.toolInput
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
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { input, connected: false, slots: [], isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
        intent: "calendar",
        requiresConfirmation: false,
        source: {
          label: "Google Calendar není připojený",
          detail:
            "Pro čtení reálné dostupnosti je potřeba nejdřív připojit Google účet. Bez něj agent nebude vydávat demo sloty za skutečný kalendář.",
          mode: "planned_integration",
        },
        },
      };
    }

    return {
      toolName: action.toolName,
      toolInput: input,
      result: {
        input,
        connected: true,
        busySlots: result.busySlots,
        freeWindows: result.freeWindows,
        freeSlots: result.slots,
        isMock: false,
        isEmpty: result.slots.length === 0,
      },
      isMock: false,
      isEmpty: result.slots.length === 0,
      response: {
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
    };
  }

  if (action.toolName === "create_email_draft") {
    const rawInput =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? (action.toolInput as Record<string, unknown>)
        : {};

    // Fallback: extract email from user message if planner missed it
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

    const calendarConnected = !!options?.googleToken;
    const hasSlot = !!draft.recommendedSlot;

    const source = hasSlot
      ? GOOGLE_CALENDAR_SOURCE
      : calendarConnected
        ? {
            label: "Google Calendar — žádné volné termíny",
            detail: "V nastaveném rozsahu nebyly nalezeny žádné volné termíny. E-mail byl připraven bez doporučeného termínu.",
            mode: "live" as const,
          }
        : {
            label: "Google Calendar není připojený",
            detail: "E-mail byl připraven bez doporučeného termínu — pro reálnou dostupnost připojte Google účet.",
            mode: "planned_integration" as const,
          };

    // If we have no body (draft failed completely), return error
    if (!draft.body) {
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { input, draft, connected: calendarConnected, isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: { intent: "email", requiresConfirmation: false, source },
      };
    }

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { input, draft, connected: calendarConnected, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "email",
        requiresConfirmation: true,
        source,
        emailDraft: {
          to: draft.recipientEmail,
          subject: draft.subject,
          body: draft.body,
        },
      },
    };
  }

  if (action.toolName === "send_email") {
    if (!options?.googleToken) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: {
          sent: false,
          reason: "google_not_connected",
          isMock: false,
          isEmpty: true,
        },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "email",
          requiresConfirmation: false,
          source: {
            label: "Google účet není připojený",
            detail: "Pro odesílání e-mailů je potřeba připojit Google účet.",
            mode: "planned_integration",
          },
        },
      };
    }

    const input = SendEmailInputSchema.parse(action.toolInput);
    const result = await sendGmailMessage(options.googleToken, {
      to: input.to,
      subject: input.subject,
      body: input.body,
    });
    const toolResult = {
      sent: true,
      messageId: result.messageId,
      to: input.to,
      subject: input.subject,
      isMock: false,
      isEmpty: false,
    };

    return {
      toolName: action.toolName,
      toolInput: input,
      result: toolResult,
      isMock: false,
      isEmpty: false,
      response: {
        intent: "email",
        requiresConfirmation: false,
        source: {
          label: "Gmail",
          detail: `E-mail byl odeslán na ${input.to} přes Gmail API.`,
          mode: "live",
        },
      },
    };
  }

  if (action.toolName === "create_weekly_report") {
    const input = CreateWeeklyReportInputSchema.parse(action.toolInput);
    const report = createWeeklyReport(input);
    const result = { input, report, isMock: true, isEmpty: false };

    return {
      toolName: action.toolName,
      toolInput: input,
      result,
      isMock: true,
      isEmpty: false,
      response: {
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
    };
  }

  if (action.toolName === "send_morning_report") {
    const rawInput =
      typeof action.toolInput === "object" && action.toolInput !== null ? action.toolInput : {};
    const input = SendMorningReportInputSchema.parse(rawInput);
    const recipientEmail = input.recipientEmail ?? options?.userEmail;

    if (!options?.googleToken) {
      return {
        toolName: action.toolName,
        toolInput: input,
        result: {
          sent: false,
          reason: "google_not_connected",
          isMock: false,
          isEmpty: true,
        },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "report",
          requiresConfirmation: false,
          source: {
            label: "Google účet není připojený",
            detail: "Pro odesílání ranního reportu emailem je potřeba připojit Google účet.",
            mode: "planned_integration",
          },
        },
      };
    }

    if (!recipientEmail) {
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { sent: false, reason: "no_recipient_email", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "report",
          requiresConfirmation: false,
          source: MORNING_REPORT_SOURCE,
        },
      };
    }

    const report = await buildMorningReport();
    const { messageId } = await sendGmailMessage(options.googleToken, {
      to: recipientEmail,
      subject: report.subject,
      body: report.text,
      html: report.html,
    });
    const toolResult = {
      sent: true,
      to: recipientEmail,
      subject: report.subject,
      messageId,
      isMock: false,
      isEmpty: false,
    };

    return {
      toolName: action.toolName,
      toolInput: input,
      result: toolResult,
      isMock: false,
      isEmpty: false,
      response: {
        intent: "report",
        requiresConfirmation: false,
        source: MORNING_REPORT_SOURCE,
        artifact: {
          type: "table",
          title: "Ranní report — přehled",
          columns: ["položka", "hodnota"],
          rows: [
            { položka: "Příjemce", hodnota: recipientEmail },
            { položka: "Nových leadů (7 dní)", hodnota: String(report.totalLeads) },
            { položka: "Nemovitostí k doplnění", hodnota: String(report.incompleteCount) },
            { položka: "Nabídek v Praze", hodnota: String(report.listingCount) },
            { položka: "Gmail Message ID", hodnota: messageId },
          ],
        },
      },
    };
  }

  if (action.toolName === "watch_market") {
    const input = WatchMarketInputSchema.parse(action.toolInput);

    const [scheduleResult, searchResult] =
      input.mode === "schedule"
        ? await Promise.all([
            upsertMarketWatchRule(input, { recipientEmail: options?.userEmail ?? null }),
            searchMarketListings(input),
          ])
        : [null, await searchMarketListings(input)] as const;
    const isMock =
      input.mode === "schedule" &&
      getDataSourceEnvironment().DATA_SOURCE === "local";
    const isEmpty = !searchResult.configured || searchResult.listings.length === 0;

    const source = searchResult.configured
      ? MARKET_WATCH_SOURCE
      : {
          label: "Firecrawl není nastavený",
          detail:
            "Pro živé hledání na realitních serverech je potřeba nastavit FIRECRAWL_API_KEY.",
          mode: "planned_integration" as const,
        };

    return {
      toolName: action.toolName,
      toolInput: input,
      result: {
        input,
        mode: input.mode,
        scheduleResult,
        searchResult,
        scheduled: input.mode === "schedule",
        isMock,
        isEmpty,
      },
      isMock,
      isEmpty,
      response: {
        intent: "market_watch",
        requiresConfirmation: input.mode === "schedule",
        source,
        artifact: searchResult.listings.length > 0
          ? {
              type: "table",
              title: "Aktuální nabídky z realitních serverů",
              columns: ["title", "description", "source", "url"],
              rows: searchResult.listings.map((listing) => ({
                title: listing.title,
                description: listing.description,
                source: listing.source,
                url: listing.url,
              })),
            }
          : undefined,
      },
    };
  }

  if (action.toolName === "create_scheduled_task") {
    if (!options?.userId) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { created: false, reason: "not_authenticated", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "general",
          requiresConfirmation: false,
          source: {
            label: "Přihlášení vyžadováno",
            detail: "Pro vytvoření naplánované úlohy musíte být přihlášeni.",
            mode: "planned_integration",
          },
        },
      };
    }

    const input = CreateScheduledTaskAgentInputSchema.parse(action.toolInput);
    const task = await createScheduledTask(options.userId, {
      ...input,
      recipient_email: options.userEmail,
    });

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { task, created: true, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "general",
        requiresConfirmation: false,
        source: {
          label: "Naplánovaná úloha",
          detail: `Denní přehled pro ${input.location} v ${input.schedule_time} byl uložen.`,
          mode: "live",
        },
        artifact: {
          type: "table",
          title: "Naplánovaná úloha",
          columns: ["položka", "hodnota"],
          rows: [
            { položka: "Lokalita", hodnota: input.location },
            { položka: "Čas odeslání", hodnota: input.schedule_time },
            { položka: "Frekvence", hodnota: "každý den" },
            { položka: "První spuštění", hodnota: new Date(task.next_run_at).toLocaleString("cs-CZ", { timeZone: input.timezone }) },
          ],
        },
      },
    };
  }

  if (action.toolName === "list_scheduled_tasks") {
    if (!options?.userId) {
      return {
        toolName: action.toolName,
        toolInput: {},
        result: { tasks: [], isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "general",
          requiresConfirmation: false,
          source: {
            label: "Přihlášení vyžadováno",
            detail: "Pro zobrazení naplánovaných úloh musíte být přihlášeni.",
            mode: "planned_integration",
          },
        },
      };
    }

    const tasks = await listScheduledTasks(options.userId);

    return {
      toolName: action.toolName,
      toolInput: {},
      result: { tasks, count: tasks.length, isMock: false, isEmpty: tasks.length === 0 },
      isMock: false,
      isEmpty: tasks.length === 0,
      response: {
        intent: "general",
        requiresConfirmation: false,
        source: {
          label: "Naplánované úlohy",
          detail: "Seznam aktivních naplánovaných úloh z databáze.",
          mode: "live",
        },
        artifact: tasks.length > 0
          ? {
              type: "table",
              title: "Moje naplánované úlohy",
              columns: ["id", "lokalita", "čas", "frekvence", "příští spuštění"],
              rows: tasks.map((t) => ({
                id: t.id,
                lokalita: (t.params as { location: string }).location,
                čas: t.schedule_time,
                frekvence: t.frequency === "daily" ? "každý den" : t.frequency,
                "příští spuštění": new Date(t.next_run_at).toLocaleString("cs-CZ", { timeZone: t.timezone }),
              })),
            }
          : undefined,
      },
    };
  }

  if (action.toolName === "update_scheduled_task") {
    if (!options?.userId) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { updated: false, reason: "not_authenticated", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: { intent: "general", requiresConfirmation: false },
      };
    }

    const input = UpdateScheduledTaskAgentInputSchema.parse(action.toolInput);
    const { id, ...patch } = input;
    const task = await updateScheduledTask(id, options.userId, patch);

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { task, updated: true, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "general",
        requiresConfirmation: false,
        source: { label: "Naplánovaná úloha", detail: "Úloha byla aktualizována.", mode: "live" },
      },
    };
  }

  if (action.toolName === "delete_scheduled_task") {
    if (!options?.userId) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { deleted: false, reason: "not_authenticated", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: { intent: "general", requiresConfirmation: false },
      };
    }

    const input = DeleteScheduledTaskAgentInputSchema.parse(action.toolInput);
    await deleteScheduledTask(input.id, options.userId);

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { deleted: true, id: input.id, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "general",
        requiresConfirmation: false,
        source: { label: "Naplánovaná úloha", detail: "Úloha byla smazána.", mode: "live" },
      },
    };
  }

  throw new Error(`Unsupported agent tool: ${action.toolName}`);
}

export async function runAgent(
  userMessage: string,
  options?: {
    googleToken?: StoredGoogleToken | null;
    history?: ChatHistoryItem[];
    userEmail?: string;
    userId?: string;
  },
): Promise<ChatResponse> {
  if (!isGeminiConfigured()) {
    return {
      intent: "general",
      requiresConfirmation: false,
      source: {
        label: "Gemini není nastavený",
        detail:
          "Agent nyní zpracovává všechny dotazy přes Gemini planner. Bez GEMINI_API_KEY nelze dotaz zpracovat.",
        mode: "planned_integration",
      },
      message:
        "Gemini API klíč není nastavený, agent nemůže zpracovat dotaz.",
    };
  }

  const { client, model } = createGeminiClient();
  const contents: Content[] = [
    ...(options?.history ?? []).map((item) => ({
      role: item.role === "user" ? "user" : "model",
      parts: [{ text: item.content }],
    }) satisfies Content),
    {
      role: "user",
      parts: [{ text: userMessage }],
    },
  ];
  const executions: ToolExecution[] = [];
  const systemInstruction = [
    CONVERSATIONAL_SYSTEM_INSTRUCTION,
    `Aktuální datum: ${new Date().toISOString().slice(0, 10)}.`,
    `Google Calendar připojen: ${options?.googleToken ? "ano" : "ne"}.`,
    "Pro relativní datumy počítej rozsahy z aktuálního data výše.",
  ].join("\n");

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        ...getFunctionCallingConfig(),
      },
    });
    const functionCalls = getFunctionCalls(response);

    if (functionCalls.length === 0) {
      if (needsConfirmationBeforeFinish(userMessage, executions, options?.history)) {
        const latestExecution = getLatestExecution(executions);
        const artifacts = getAllArtifacts(executions);

        return {
          intent: latestExecution?.response.intent ?? "general",
          requiresConfirmation: true,
          source: latestExecution?.response.source,
          artifact: latestExecution?.response.artifact,
          artifacts: artifacts.length > 0 ? artifacts : undefined,
          emailDraft: latestExecution?.response.emailDraft,
          message: buildFinishConfirmationMessage(userMessage, executions),
        };
      }

      return createTextResponse(response.text ?? "Hotovo.", executions);
    }

    contents.push({
      role: "model",
      parts: functionCalls.map((functionCall) => ({ functionCall })),
    });

    for (const functionCall of functionCalls) {
      const action = createFunctionToolCall(functionCall);

      if (hasAlreadyRunAction(executions, action)) {
        return createTextResponse(
          "Už mám výsledek potřebného nástroje, proto stejný krok neopakuji.",
          executions,
        );
      }

      if (
        isConsequentialAction(action) &&
        !userConfirmedPendingAction(userMessage, options?.history)
      ) {
        const latestExecution = getLatestExecution(executions);
        const artifacts = getAllArtifacts(executions);

        return {
          intent: latestExecution?.response.intent ?? "general",
          requiresConfirmation: true,
          source: latestExecution?.response.source,
          artifact: latestExecution?.response.artifact,
          artifacts: artifacts.length > 0 ? artifacts : undefined,
          emailDraft: latestExecution?.response.emailDraft,
          message: buildConfirmationMessage(action),
        };
      }

      const execution = await executeToolAction(userMessage, action, {
        googleToken: options?.googleToken,
        userEmail: options?.userEmail,
        userId: options?.userId,
      });
      executions.push(execution);
      contents.push(
        createFunctionResponseContent(
          action.toolName,
          {
            output: execution.result,
            isMock: execution.isMock,
            isEmpty: execution.isEmpty,
          },
          action.id,
        ),
      );
    }
  }

  return {
    intent: getLatestExecution(executions)?.response.intent ?? "general",
    requiresConfirmation: false,
    source: getLatestExecution(executions)?.response.source,
    artifact: getLatestExecution(executions)?.response.artifact,
    artifacts: getAllArtifacts(executions),
    message: "Nepodařilo se dokončit úkol v limitu kroků.",
  };
}
