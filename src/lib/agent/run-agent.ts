import { type ChatResponse, type ChatHistoryItem } from "@/lib/contracts/chat";
import { classifyIntent, intentToRouteHint } from "@/lib/agent/runtime/intent";
import { resolveCapabilities, buildCapabilityNote } from "@/lib/agent/runtime/capability";
import { verifyFinalMessage } from "@/lib/agent/runtime/verifier";
import {
  generateConfirmationToken,
  verifyConfirmationToken,
  type PendingTool,
} from "@/lib/agent/confirmation-token";
import { classifyConfirmationIntent } from "@/lib/agent/confirmation-intent";
import {
  CreateCalendarEventInputSchema,
  CreateEmailDraftInputSchema,
  CreatePresentationInputSchema,
  CreateWeeklyReportInputSchema,
  FindCalendarEventsInputSchema,
  FindCalendarSlotsInputSchema,
  FindIncompletePropertiesInputSchema,
  QueryLeadMetricsInputSchema,
  QueryPropertyMetricsInputSchema,
  QuerySalesMetricsInputSchema,
  SendMorningReportInputSchema,
  SendEmailInputSchema,
  WatchMarketInputSchema,
  CreateScheduledTaskAgentInputSchema,
  UpdateCalendarEventInputSchema,
  DeleteCalendarEventInputSchema,
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
import { getCronSecret, getDataSourceEnvironment, isGeminiConfigured, isQStashConfigured } from "@/lib/env";
import { listRecentEmails, readEmail, searchEmails } from "@/lib/tools/gmail-read";
import {
  ListRecentEmailsInputSchema,
  ReadEmailInputSchema,
  SearchEmailsInputSchema,
  CreateScheduledTasksBatchInputSchema,
} from "@/lib/contracts/tools";
import { scheduleQStashTrigger, getRunDueTasksUrl } from "@/lib/scheduler/qstash";
import { getDefaultOrganizationId } from "@/lib/supabase/server";
import {
  createViewingEmailDraft,
  createWeeklyReport,
  findViewingSlots,
  queryMonthlyPerformance,
  watchMarket,
} from "@/lib/tools/demo-operations";
import { queryLeadMetrics } from "@/lib/tools/lead-metrics";
import { queryClientMetrics } from "@/lib/tools/client-metrics";
import { searchMarketListings } from "@/lib/tools/market-search";
import { upsertMarketWatchRule } from "@/lib/tools/market-watch-schedule";
import { buildMorningReport } from "@/lib/tools/morning-report";
import { createPresentation } from "@/lib/tools/presentation";
import { findIncompleteProperties } from "@/lib/tools/property-quality";
import { queryPropertyMetrics } from "@/lib/tools/property-metrics";
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  findGoogleCalendarEvents,
  hasCalendarWriteScope,
  sendGmailMessage,
  updateGoogleCalendarEvent,
  type StoredGoogleToken,
} from "@/lib/google/oauth";
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

function generateDemoCalendarSlots(timezone: string) {
  const now = new Date();
  const entries = [
    { daysAhead: 2, hour: 10 },
    { daysAhead: 3, hour: 14 },
    { daysAhead: 4, hour: 11 },
  ];

  return entries.map(({ daysAhead, hour }) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    const dateStr = d.toISOString().slice(0, 10);
    const startsAt = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00+02:00`).toISOString();
    const endsAt = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:45:00+02:00`).toISOString();
    const label = new Intl.DateTimeFormat("cs-CZ", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "numeric",
    }).format(new Date(startsAt));
    return { startsAt, endsAt, label: `${label} v ${String(hour).padStart(2, "0")}:00` };
  });
}

function formatCalendarTimeRange(startIso: string, endIso: string, tz: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateFmt = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${dateFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`;
}

function formatEventDateTime(isoString: string, tz: string): string {
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: tz,
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
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

    // If the explicit date is in the past, fall through to null so Calendar uses today onwards
    if (formatDateKey(date) < formatDateKey(today)) {
      return null;
    }

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
  const from = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 17, 1, 12, 0, 0));

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
    "query_client_metrics",
    "query_property_metrics",
    "query_sales_metrics",
    "find_incomplete_properties",
    "find_calendar_slots",
    "find_calendar_events",
    "create_calendar_event",
    "update_calendar_event",
    "delete_calendar_event",
    "create_email_draft",
    "send_email",
    "create_weekly_report",
    "create_presentation",
    "send_morning_report",
    "watch_market",
    "create_scheduled_task",
    "create_scheduled_tasks_batch",
    "list_scheduled_tasks",
    "update_scheduled_task",
    "delete_scheduled_task",
    "list_recent_emails",
    "read_email",
    "search_emails",
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


const ALWAYS_CONSEQUENTIAL = new Set<string>([
  "send_email",
  "send_morning_report",
  "create_calendar_event",
  "update_calendar_event",
  "delete_calendar_event",
  "create_scheduled_task",
  "create_scheduled_tasks_batch",
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


function extractSendEmailFields(toolInput: unknown): { to: string; subject: string; body: string } | null {
  const raw = typeof toolInput === "object" && toolInput !== null ? (toolInput as Record<string, unknown>) : {};
  if (typeof raw.to !== "string" || typeof raw.subject !== "string" || typeof raw.body !== "string") return null;
  return { to: raw.to, subject: raw.subject, body: raw.body };
}

function buildConfirmationMessage(action: FunctionToolCall) {
  if (action.toolName === "send_email") {
    const email = extractSendEmailFields(action.toolInput);
    if (!email) return "Připravil jsem e-mail k odeslání. Potvrďte prosím odpovědí 'ano pošli'.";
    return `Připravil jsem e-mail k odeslání:\n\n**Komu:** ${email.to}\n**Předmět:** ${email.subject}\n\nText e-mailu:\n${email.body}\n\nMám tento e-mail odeslat? Potvrďte prosím 'ano pošli'.`;
  }

  if (action.toolName === "send_morning_report") {
    return "Chystám se odeslat ranní report e-mailem. Potvrďte prosím odpovědí ’ano pošli’.";
  }

  if (action.toolName === "watch_market") {
    return "Chystám se založit pravidelný monitoring realitních nabídek. Potvrďte prosím odpovědí ’ano, založ monitoring’.";
  }

  if (action.toolName === "create_scheduled_tasks_batch") {
    const raw = action.toolInput as Record<string, unknown>;
    const tasks = Array.isArray(raw.tasks) ? (raw.tasks as Record<string, unknown>[]) : [];
    const lines = tasks.map((t, i) => {
      const loc = typeof t.location === "string" ? t.location : "?";
      const kind = t.schedule_kind === "one_time" ? "Jednorázový" : "Opakovaný";
      if (t.schedule_kind === "one_time" && typeof t.run_at === "string") {
        const dt = new Intl.DateTimeFormat("cs-CZ", {
          timeZone: "Europe/Prague",
          weekday: "long",
          day: "numeric",
          month: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date(t.run_at));
        return `${i + 1}. ${kind} realitní přehled pro **${loc}** — ${dt}`;
      }
      const time = typeof t.schedule_time === "string" ? t.schedule_time : "08:00";
      return `${i + 1}. ${kind} realitní přehled pro **${loc}** každý den v **${time}**`;
    });
    return `Mám nastavit **${tasks.length} naplánované${tasks.length === 1 ? "" : tasks.length < 5 ? " úlohy" : " úloh"}?**\n\n${lines.join("\n")}\n\nPotvrďte prosím odpovědí 'ano založ'.`;
  }

  if (action.toolName === "create_scheduled_task") {
    const raw = action.toolInput as Record<string, unknown>;
    const location = typeof raw.location === "string" ? raw.location : "vybraná lokalita";
    const scheduleKind = typeof raw.schedule_kind === "string" ? raw.schedule_kind : "recurring";

    if (scheduleKind === "one_time" && typeof raw.run_at === "string") {
      const runAtDate = new Date(raw.run_at);
      const localTime = new Intl.DateTimeFormat("cs-CZ", {
        timeZone: "Europe/Prague",
        weekday: "long",
        day: "numeric",
        month: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(runAtDate);
      if (isQStashConfigured()) {
        return `Mám nastavit **jednorázový** realitní přehled pro **${location}** na **${localTime}** a poslat výsledky přesně v ten čas e-mailem? Potvrďte prosím odpovědí ‘ano založ’.`;
      }
      return `Mám zařadit **jednorázový** realitní přehled pro **${location}** do fronty? Spustí se při nejbližším denním běhu po ${localTime} (každý den v 08:00 Praha). Pro přesné spuštění v zadaný čas je potřeba nastavit QStash scheduler. Potvrďte prosím odpovědí ‘ano založ’.`;
    }

    const time = typeof raw.schedule_time === "string" ? raw.schedule_time : "08:00";
    return `Chystám se nastavit denní automatický přehled nabídek z **${location}** každý den v **${time}**. Úloha se uloží a bude vám chodit e-mailem. Potvrďte prosím odpovědí ‘ano založ’.`;
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

  if (action.toolName === "create_calendar_event") {
    const raw = action.toolInput as Record<string, unknown>;
    const title = typeof raw.title === "string" ? raw.title : "Nová schůzka";
    const tz = typeof raw.timezone === "string" ? raw.timezone : "Europe/Prague";
    const start = typeof raw.startDateTime === "string" ? raw.startDateTime : "";
    const end = typeof raw.endDateTime === "string" ? raw.endDateTime : "";
    const location = typeof raw.location === "string" ? raw.location : null;
    const attendeeName = typeof raw.attendeeName === "string" ? raw.attendeeName : null;
    const lines = [
      `**Název:** ${title}`,
      start ? `**Začátek:** ${formatEventDateTime(start, tz)}` : null,
      end ? `**Konec:** ${formatEventDateTime(end, tz)}` : null,
      location ? `**Místo:** ${location}` : null,
      attendeeName ? `**Účastník:** ${attendeeName}` : null,
      `**Kalendář:** primární Google kalendář`,
    ]
      .filter(Boolean)
      .join("\n");
    return `Mám vytvořit tuto událost v Google Kalendáři?\n\n${lines}\n\nPotvrďte prosím odpovědí ‘ano vytvoř’.`;
  }

  if (action.toolName === "update_calendar_event") {
    const raw = action.toolInput as Record<string, unknown>;
    const tz = typeof raw.timezone === "string" ? raw.timezone : "Europe/Prague";
    const eventTitle = typeof raw.eventTitle === "string" ? raw.eventTitle : "Událost";
    const newStart = typeof raw.startDateTime === "string" ? raw.startDateTime : null;
    const newEnd = typeof raw.endDateTime === "string" ? raw.endDateTime : null;
    const newTitle = typeof raw.title === "string" ? raw.title : null;
    const newLocation = typeof raw.location === "string" ? raw.location : null;
    const lines = [
      `**Událost:** ${eventTitle}`,
      newTitle ? `**Nový název:** ${newTitle}` : null,
      newStart ? `**Nový začátek:** ${formatEventDateTime(newStart, tz)}` : null,
      newEnd ? `**Nový konec:** ${formatEventDateTime(newEnd, tz)}` : null,
      newLocation !== null ? `**Nové místo:** ${newLocation || "(bez místa)"}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    return `Mám upravit tuto událost v Google Kalendáři?\n\n${lines}\n\nPotvrďte prosím odpovědí ‘ano uprav’.`;
  }

  if (action.toolName === "delete_calendar_event") {
    const raw = action.toolInput as Record<string, unknown>;
    const eventTitle = typeof raw.eventTitle === "string" ? raw.eventTitle : "tuto událost";
    return `Opravdu smazat: **${eventTitle}**? Tato akce je nevratná a nelze ji vrátit zpět.\n\nPotvrďte prosím odpovědí ‘ano smaž’.`;
  }

  return "Tento krok má vedlejší efekt. Potvrďte prosím, že ho mám provést.";
}


function buildConfirmedActionMessage(
  action: FunctionToolCall,
  execution: ToolExecution,
): string {
  const raw =
    typeof action.toolInput === "object" && action.toolInput !== null
      ? (action.toolInput as Record<string, unknown>)
      : {};

  if (action.toolName === "delete_calendar_event") {
    const title = typeof raw.eventTitle === "string" ? raw.eventTitle : "událost";
    return execution.isEmpty
      ? `Událost '${title}' se nepodařilo smazat.`
      : `Hotovo, událost **${title}** byla smazána z Google Kalendáře.`;
  }
  if (action.toolName === "update_calendar_event") {
    const title = typeof raw.eventTitle === "string" ? raw.eventTitle : "událost";
    return execution.isEmpty
      ? `Událost '${title}' se nepodařilo upravit.`
      : `Hotovo, událost **${title}** byla upravena v Google Kalendáři.`;
  }
  if (action.toolName === "create_calendar_event") {
    const title = typeof raw.title === "string" ? raw.title : "schůzka";
    return execution.isEmpty
      ? `Událost '${title}' se nepodařilo vytvořit.`
      : `Hotovo, událost **${title}** byla přidána do Google Kalendáře.`;
  }
  if (action.toolName === "send_email") {
    if (execution.isEmpty) return "E-mail se nepodařilo odeslat.";
    const emailRaw = action.toolInput as Record<string, unknown>;
    const to = typeof emailRaw.to === "string" ? emailRaw.to : "";
    const subject = typeof emailRaw.subject === "string" ? emailRaw.subject : "";
    const details = to && subject ? `\n\n**Komu:** ${to}\n**Předmět:** ${subject}` : "";
    return `Hotovo, e-mail byl odeslán.${details}`;
  }
  if (action.toolName === "send_morning_report") {
    return execution.isEmpty
      ? "Ranní report se nepodařilo odeslat."
      : "Hotovo, ranní report byl odeslán e-mailem.";
  }
  if (action.toolName === "create_scheduled_tasks_batch") {
    const result = execution.result as { results?: { ok: boolean; location: string; scheduleKind: string; reason?: string; qstash?: { attempted?: boolean; scheduled?: boolean } }[] };
    const created = result?.results?.filter((r) => r.ok) ?? [];
    const failed = result?.results?.filter((r) => !r.ok) ?? [];
    if (created.length === 0) return "Nepodařilo se vytvořit žádnou úlohu.";
    const lines = created.map((r, i) => {
      if (r.scheduleKind === "one_time") {
        const q = r.qstash;
        const suffix = q?.attempted && q?.scheduled
          ? " — přesné spuštění přes QStash zajištěno"
          : q?.attempted && !q?.scheduled
          ? " — ⚠️ QStash selhal, odešle se při nejbližším cron běhu"
          : " — odešle se při nejbližším cron běhu";
        return `${i + 1}. **${r.location}** — jednorázově${suffix}`;
      }
      return `${i + 1}. **${r.location}** — každý den`;
    });
    const failLines = failed.length > 0
      ? `\n\n⚠️ ${failed.length} úloha/y se nepodařilo vytvořit:\n${failed.map((r, i) => `${created.length + i + 1}. **${r.location}** — ${r.reason ?? "Chyba."}`).join("\n")}`
      : "";
    const plural = created.length === 1 ? " úlohu" : created.length < 5 ? " úlohy" : " úloh";
    return `Hotovo, nastavil jsem **${created.length}** naplánované${plural}:\n\n${lines.join("\n")}${failLines}`;
  }

  if (action.toolName === "create_scheduled_task") {
    const result = execution.result as { created?: boolean; reason?: string; localTime?: string; scheduleKind?: string; qstash?: { attempted?: boolean; scheduled?: boolean } };
    if (result?.reason === "past_datetime") {
      const t = result.localTime ?? "";
      return `Čas ${t} už dnes uplynul. Chcete úlohu naplánovat na zítra v ${t}?`;
    }
    if (result?.reason === "missing_run_at") {
      return "Pro jednorázovou úlohu je potřeba zadat přesný čas. Zkuste to prosím znovu.";
    }
    if (execution.isEmpty) return "Naplánovanou úlohu se nepodařilo vytvořit.";
    if (result?.scheduleKind === "one_time") {
      const q = result?.qstash;
      if (q?.attempted && q?.scheduled) {
        return "Hotovo, jednorázový report je naplánovaný — přesné spuštění přes QStash bylo zajištěno.";
      }
      if (q?.attempted && !q?.scheduled) {
        return "Hotovo, jednorázový report je uložený, ale přesné spuštění přes QStash se nepodařilo naplánovat. Odešle se při nejbližším cron běhu (každý den v 08:00 Praha).";
      }
      return "Hotovo, jednorázový report byl zařazen do fronty. Spustí se v nejbližším denním běhu (každý den v 08:00 Praha).";
    }
    return "Hotovo, naplánovaná úloha byla vytvořena.";
  }
  if (action.toolName === "update_scheduled_task") {
    return execution.isEmpty
      ? "Naplánovanou úlohu se nepodařilo upravit."
      : "Hotovo, naplánovaná úloha byla upravena.";
  }
  if (action.toolName === "delete_scheduled_task") {
    return execution.isEmpty
      ? "Naplánovanou úlohu se nepodařilo smazat."
      : "Hotovo, naplánovaná úloha byla smazána.";
  }
  if (action.toolName === "watch_market") {
    return "Hotovo, monitoring realitních nabídek byl nastaven.";
  }
  return "Hotovo.";
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
    artifacts: artifacts.length > 0 ? artifacts : undefined,
    generatedOutputs: latestExecution?.response.generatedOutputs,
    message,
  };
}

type QStashOutcome =
  | { attempted: false; scheduled: false }
  | { attempted: true; scheduled: true; messageId: string }
  | { attempted: true; scheduled: false; error: string };

async function tryScheduleQStash(runAt: Date): Promise<QStashOutcome> {
  if (!isQStashConfigured()) {
    return { attempted: false, scheduled: false };
  }
  const cronSecret = getCronSecret();
  const qstashToken = process.env.QSTASH_TOKEN ?? "";
  if (!cronSecret || !qstashToken) {
    return { attempted: true, scheduled: false, error: "QStash credentials nejsou nastaveny." };
  }
  const result = await scheduleQStashTrigger(runAt, getRunDueTasksUrl(), cronSecret, qstashToken);
  if (result?.messageId) {
    return { attempted: true, scheduled: true, messageId: result.messageId };
  }
  return { attempted: true, scheduled: false, error: "QStash request selhal." };
}

function formatAnalyticsPeriod(from: string, to: string): string {
  const y1 = from.slice(0, 4);
  const m1 = parseInt(from.slice(5, 7), 10);
  const m2 = parseInt(to.slice(5, 7), 10);
  const y2 = to.slice(0, 4);
  if (y1 === y2) {
    if (m1 === 1 && m2 === 3) return `1. kvartál ${y1}`;
    if (m1 === 4 && m2 === 6) return `2. kvartál ${y1}`;
    if (m1 === 7 && m2 === 9) return `3. kvartál ${y1}`;
    if (m1 === 10 && m2 === 12) return `4. kvartál ${y1}`;
    if (m1 === 1 && m2 === 12) return String(y1);
  }
  const months = ["led", "úno", "bře", "dub", "kvě", "čer", "čec", "srp", "zář", "říj", "lis", "pro"];
  return `${months[m1 - 1]}–${months[m2 - 1]} ${y2}`;
}

function buildLeadArtifactTitle(groupBy: string, dateRange: { from: string; to: string }): string {
  const period = formatAnalyticsPeriod(dateRange.from, dateRange.to);
  if (groupBy === "month") return `Vývoj leadů po měsících — ${period}`;
  if (groupBy === "source") return `Zdroje leadů — ${period}`;
  return `Leady podle statusu — ${period}`;
}

function buildClientArtifactTitle(groupBy: string, dateRange: { from: string; to: string }): string {
  const period = formatAnalyticsPeriod(dateRange.from, dateRange.to);
  if (groupBy === "month") return `Noví klienti po měsících — ${period}`;
  if (groupBy === "source") return `Zdroje nových klientů — ${period}`;
  return `Klienti podle statusu — ${period}`;
}

async function executeToolAction(
  userMessage: string,
  action: FunctionToolCall,
  options?: {
    googleToken?: StoredGoogleToken | null;
    userEmail?: string;
    userId?: string;
    threadId?: string;
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
          title: buildLeadArtifactTitle(input.groupBy, input.dateRange),
          xKey: "label",
          yKey: "count",
          data: metrics,
        },
      },
    };
  }

  if (action.toolName === "query_client_metrics") {
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
    const isMock = getDataSourceEnvironment().DATA_SOURCE === "local";

    let metrics: Awaited<ReturnType<typeof queryClientMetrics>>;
    try {
      metrics = await queryClientMetrics(organizationId, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isSchemaError = msg.includes("Failed to load client metrics") || msg.includes("column") || msg.includes("does not exist");
      if (isSchemaError) {
        return {
          toolName: action.toolName,
          toolInput: input,
          result: { input, total: 0, metrics: [], isMock, isEmpty: true, schemaError: true, errorMessage: "Tabulka clients má neočekávané schéma — chybí potřebný sloupec (source, status, nebo organization_id). Dotaz na klienty nelze provést." },
          isMock,
          isEmpty: true,
          response: {
            intent: "analytics" as const,
            requiresConfirmation: false,
            source: getBusinessDataSource(),
          },
        };
      }
      throw err;
    }

    const total = metrics.reduce((sum, metric) => sum + metric.count, 0);
    const result = { input, total, metrics, isMock, isEmpty: metrics.length === 0 };

    return {
      toolName: action.toolName,
      toolInput: input,
      result,
      isMock,
      isEmpty: metrics.length === 0,
      response: {
        intent: "analytics" as const,
        requiresConfirmation: false,
        source: getBusinessDataSource(),
        artifact: {
          type: "chart" as const,
          title: buildClientArtifactTitle(input.groupBy, input.dateRange),
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
    const metrics = await queryMonthlyPerformance(organizationId, input);
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
        title: "Vývoj leadů a prodaných nemovitostí",
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

  if (action.toolName === "query_property_metrics") {
    const organizationId = getDefaultOrganizationId();
    const input = QueryPropertyMetricsInputSchema.parse(
      action.toolInput ?? { groupBy: "status" },
    );
    const metrics = await queryPropertyMetrics(organizationId, input);
    const isMock = getDataSourceEnvironment().DATA_SOURCE === "local";
    const total = metrics.reduce((sum, m) => sum + m.count, 0);

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { input, metrics, total, isMock, isEmpty: metrics.length === 0 },
      isMock,
      isEmpty: metrics.length === 0,
      response: {
        intent: "analytics",
        requiresConfirmation: false,
        source: getBusinessDataSource(),
        artifact: {
          type: "chart",
          title: `Nemovitosti podle ${input.groupBy === "status" ? "statusu" : input.groupBy === "district" ? "městské části" : "města"}`,
          xKey: "label",
          yKey: "count",
          data: metrics,
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
      const demoSlots = generateDemoCalendarSlots(input.timezone);
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { input, connected: false, slots: demoSlots, isMock: true, isEmpty: false },
        isMock: true,
        isEmpty: false,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Demo termíny (Google Calendar nepřipojen)",
            detail:
              "Zobrazeny jsou ukázkové termíny. Pro čtení reálné dostupnosti připojte Google účet v nastavení.",
            mode: "mock_fallback",
          },
          artifact: {
            type: "table",
            title: "Ukázkové volné termíny",
            columns: ["čas", "stav"],
            rows: demoSlots.map((slot, i) => ({
              čas: formatCalendarTimeRange(slot.startsAt, slot.endsAt, input.timezone),
              stav: i === 0 ? "Volno — doporučeno (demo)" : "Volno — alternativa (demo)",
            })),
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
        title: "Dostupnost v Google Kalendáři",
        columns: ["čas", "stav"],
        rows: [
          ...result.slots.slice(0, 5).map((slot, i) => ({
            čas: formatCalendarTimeRange(slot.startsAt, slot.endsAt, input.timezone),
            stav: i === 0 ? "Volno — doporučeno" : "Volno — alternativa",
          })),
          ...result.busySlots.slice(0, 3).map((slot) => ({
            čas: formatCalendarTimeRange(slot.startsAt, slot.endsAt, input.timezone),
            stav: "Obsazeno",
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

    // Sanitize dateRange from Gemini: Gemini may return natural-language strings
    // instead of YYYY-MM-DD, which would fail the strict z.string().date() check.
    // Keep only valid ISO date strings; fall back to message inference or no dateRange.
    const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
    const geminiDateRange = rawInput.dateRange as { from?: unknown; to?: unknown } | undefined;
    const hasValidGeminiRange =
      geminiDateRange &&
      typeof geminiDateRange.from === "string" &&
      typeof geminiDateRange.to === "string" &&
      ISO_DATE_RE.test(geminiDateRange.from) &&
      ISO_DATE_RE.test(geminiDateRange.to);

    const sanitizedInput = {
      ...rawInput,
      ...(hasValidGeminiRange ? {} : { dateRange: undefined }),
    };

    const input = CreateEmailDraftInputSchema.parse({
      durationMinutes: 45,
      timezone: "Europe/Prague",
      ...withInferredCalendarRange(userMessage, sanitizedInput),
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
          to: draft.recipientEmail ?? null,
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
    const organizationId = getDefaultOrganizationId();
    const report = await createWeeklyReport(input, organizationId);
    const isMock = getDataSourceEnvironment().DATA_SOURCE === "local";
    const result = { input, report, isMock, isEmpty: false };

    return {
      toolName: action.toolName,
      toolInput: input,
      result,
      isMock,
      isEmpty: false,
      response: {
        intent: "report",
        requiresConfirmation: false,
        source: isMock ? LOCAL_REPORT_SOURCE : getBusinessDataSource(),
        artifact: {
          type: "table",
          title: "Prezentace pro vedení — 3 slidy",
          columns: ["slide", "title", "content"],
          rows: report.slides,
        },
      },
    };
  }

  if (action.toolName === "create_presentation") {
    const input = CreatePresentationInputSchema.parse(action.toolInput);
    const isMock = getDataSourceEnvironment().DATA_SOURCE === "local";
    const presentation = await createPresentation(action.toolInput, {
      userId: options?.userId,
      threadId: options?.threadId,
    });

    return {
      toolName: action.toolName,
      toolInput: input,
      result: presentation,
      isMock,
      isEmpty: false,
      response: {
        intent: "report",
        requiresConfirmation: false,
        source: isMock ? LOCAL_REPORT_SOURCE : getBusinessDataSource(),
        artifact: {
          type: "presentation",
          title: input.title,
          fileName: presentation.fileName,
          downloadUrl: presentation.downloadUrl,
          slides: presentation.slides,
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

    const isFirecrawlConnected = searchResult.configured;
    const effectiveListings = isFirecrawlConnected
      ? searchResult.listings
      : watchMarket(input).listings.map((listing) => ({
          title: listing.title,
          description: `${listing.location} — ${new Intl.NumberFormat("cs-CZ").format(listing.price)} Kč`,
          source: listing.source,
          url: listing.url,
        }));

    const isMock = !isFirecrawlConnected;
    const isEmpty = effectiveListings.length === 0;

    const source = isFirecrawlConnected
      ? MARKET_WATCH_SOURCE
      : {
          label: "Demo nabídky (Firecrawl nepřipojen)",
          detail:
            "Zobrazeny jsou ukázkové nabídky z demo datasetu. Pro živé hledání na realitních serverech nastavte FIRECRAWL_API_KEY.",
          mode: "mock_fallback" as const,
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
        artifact: effectiveListings.length > 0
          ? {
              type: "table",
              title: isFirecrawlConnected
                ? "Aktuální nabídky z realitních serverů"
                : "Ukázkové nabídky (demo dataset)",
              columns: ["title", "description", "source", "url"],
              rows: effectiveListings.map((listing) => ({
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
    const isOneTime = input.schedule_kind === "one_time";

    // Validate one_time: run_at must be present and in the future
    if (isOneTime) {
      if (!input.run_at) {
        return {
          toolName: action.toolName,
          toolInput: input,
          result: { created: false, reason: "missing_run_at", isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "general",
            requiresConfirmation: false,
            source: { label: "Chybějící čas", detail: "Pro jednorázovou úlohu musí být zadán přesný čas (run_at).", mode: "live" },
          },
        };
      }
      const runAtDate = new Date(input.run_at);
      if (runAtDate <= new Date()) {
        const localTime = new Intl.DateTimeFormat("cs-CZ", {
          timeZone: input.timezone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(runAtDate);
        return {
          toolName: action.toolName,
          toolInput: input,
          result: { created: false, reason: "past_datetime", localTime, isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "general",
            requiresConfirmation: false,
            source: { label: "Čas v minulosti", detail: `Čas ${localTime} už proběhl.`, mode: "live" },
          },
        };
      }
    }

    const task = await createScheduledTask(options.userId, {
      ...input,
      recipient_email: options.userEmail,
    });

    // For one-time tasks: schedule an exact HTTP trigger via Upstash QStash.
    // The Vercel daily cron (06:00 UTC) remains as a safety fallback.
    const qstash: QStashOutcome = isOneTime
      ? await tryScheduleQStash(new Date(task.next_run_at))
      : { attempted: false, scheduled: false };

    const tz = input.timezone;
    const rows = isOneTime
      ? [
          { položka: "Lokalita", hodnota: input.location },
          { položka: "Typ", hodnota: "Jednorázový přehled" },
          { položka: "Naplánováno na", hodnota: new Date(task.next_run_at).toLocaleString("cs-CZ", { timeZone: tz }) },
        ]
      : [
          { položka: "Lokalita", hodnota: input.location },
          { položka: "Čas odeslání", hodnota: input.schedule_time ?? "08:00" },
          { položka: "Frekvence", hodnota: "každý den" },
          { položka: "První spuštění", hodnota: new Date(task.next_run_at).toLocaleString("cs-CZ", { timeZone: tz }) },
        ];

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { task, created: true, scheduleKind: input.schedule_kind, qstash, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "general",
        requiresConfirmation: false,
        source: {
          label: "Naplánovaná úloha",
          detail: isOneTime
            ? `Jednorázový přehled pro ${input.location} byl naplánován.`
            : `Denní přehled pro ${input.location} v ${input.schedule_time ?? "08:00"} byl uložen.`,
          mode: "live",
        },
        artifact: {
          type: "table",
          title: isOneTime ? "Jednorázová úloha" : "Naplánovaná úloha",
          columns: ["položka", "hodnota"],
          rows,
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

  if (action.toolName === "find_calendar_events") {
    if (!options?.googleToken) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { events: [], isEmpty: true, isMock: false },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Google účet není připojený",
            detail: "Pro čtení událostí z Google Kalendáře je potřeba připojit Google účet.",
            mode: "planned_integration",
          },
        },
      };
    }

    const rawInput =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? (action.toolInput as Record<string, unknown>)
        : {};

    // Infer dateRange from user message if Gemini didn't provide one
    const hasDateRange =
      typeof (rawInput.dateRange as Record<string, unknown> | undefined)?.start === "string";
    const inferredRange = hasDateRange ? null : inferDateRangeFromMessage(userMessage);
    const input = FindCalendarEventsInputSchema.parse({
      timezone: "Europe/Prague",
      maxResults: 10,
      ...rawInput,
      ...(inferredRange && !hasDateRange
        ? { dateRange: { start: inferredRange.from, end: inferredRange.to } }
        : {}),
    });

    let findResult: Awaited<ReturnType<typeof findGoogleCalendarEvents>>;
    try {
      findResult = await findGoogleCalendarEvents(options.googleToken, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Neznámá chyba";
      if (msg === "MISSING_READ_SCOPE") {
        return {
          toolName: action.toolName,
          toolInput: input,
          result: { events: [], isEmpty: true, isMock: false },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "calendar",
            requiresConfirmation: false,
            source: {
              label: "Nedostatečná oprávnění Google Calendar",
              detail:
                "Pro čtení událostí je potřeba Google účet znovu připojit s oprávněním ke kalendáři.",
              mode: "planned_integration",
            },
          },
        };
      }
      throw err;
    }

    return {
      toolName: action.toolName,
      toolInput: input,
      result: findResult,
      isMock: false,
      isEmpty: findResult.isEmpty,
      response: {
        intent: "calendar",
        requiresConfirmation: false,
        source: {
          label: "Google Calendar",
          detail: "Události načtené z Google Kalendáře.",
          mode: "live",
        },
        artifact:
          findResult.events.length > 0
            ? {
                type: "table",
                title: "Události v kalendáři",
                columns: ["Název", "Kdy", "Kde"],
                rows: findResult.events.map((ev) => ({
                  Název: ev.title,
                  Kdy: `${ev.dateLabel}, ${ev.timeLabel}`,
                  Kde: ev.location ?? "",
                })),
              }
            : undefined,
      },
    };
  }

  if (action.toolName === "update_calendar_event") {
    if (!options?.googleToken) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { updated: false, reason: "google_not_connected", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Google účet není připojený",
            detail: "Pro úpravu událostí v Google Kalendáři je potřeba připojit Google účet.",
            mode: "planned_integration",
          },
        },
      };
    }

    if (!hasCalendarWriteScope(options.googleToken)) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { updated: false, reason: "missing_write_scope", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Nedostatečná oprávnění Google Calendar",
            detail:
              "Google účet je připojený pouze pro čtení. Pro úpravy je potřeba Google účet znovu připojit s oprávněním ke kalendáři.",
            mode: "planned_integration",
          },
        },
      };
    }

    const rawUpdate =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? (action.toolInput as Record<string, unknown>)
        : {};
    const updateInput = UpdateCalendarEventInputSchema.parse(rawUpdate);

    // Backend guard: refuse if new start time is in the past
    if (updateInput.startDateTime) {
      const newStart = new Date(updateInput.startDateTime);
      if (newStart <= new Date()) {
        return {
          toolName: action.toolName,
          toolInput: updateInput,
          result: { updated: false, reason: "past_datetime", isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "calendar",
            requiresConfirmation: false,
            source: {
              label: "Termín v minulosti",
              detail: "Nelze přesunout událost do minulosti. Zadejte budoucí termín.",
              mode: "live",
            },
          },
        };
      }
    }

    let updatedEvent: Awaited<ReturnType<typeof updateGoogleCalendarEvent>>;
    try {
      updatedEvent = await updateGoogleCalendarEvent(options.googleToken, updateInput);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Neznámá chyba";
      if (msg === "MISSING_WRITE_SCOPE") {
        return {
          toolName: action.toolName,
          toolInput: updateInput,
          result: { updated: false, reason: "missing_write_scope", isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "calendar",
            requiresConfirmation: false,
            source: {
              label: "Nedostatečná oprávnění Google Calendar",
              detail:
                "Pro úpravy událostí je potřeba Google účet znovu připojit s oprávněním ke kalendáři.",
              mode: "planned_integration",
            },
          },
        };
      }
      if (msg === "EVENT_NOT_FOUND") {
        return {
          toolName: action.toolName,
          toolInput: updateInput,
          result: { updated: false, reason: "event_not_found", isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "calendar",
            requiresConfirmation: false,
            source: {
              label: "Událost nenalezena",
              detail: "Událost s tímto ID nebyla nalezena v Google Kalendáři.",
              mode: "live",
            },
          },
        };
      }
      throw err;
    }

    return {
      toolName: action.toolName,
      toolInput: updateInput,
      result: { event: updatedEvent, updated: true, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "calendar",
        requiresConfirmation: false,
        source: {
          label: "Google Calendar",
          detail: "Událost byla upravena v Google Kalendáři.",
          mode: "live",
        },
        artifact: {
          type: "table",
          title: "Upravená událost",
          columns: ["položka", "hodnota"],
          rows: [
            { položka: "Název", hodnota: updatedEvent.title },
            { položka: "Začátek", hodnota: updatedEvent.startLocal },
            { položka: "Konec", hodnota: updatedEvent.endLocal },
            ...(updatedEvent.location
              ? [{ položka: "Místo", hodnota: updatedEvent.location }]
              : []),
            ...(updatedEvent.htmlLink
              ? [{ položka: "Odkaz", hodnota: updatedEvent.htmlLink }]
              : []),
          ],
        },
      },
    };
  }

  if (action.toolName === "delete_calendar_event") {
    if (!options?.googleToken) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { deleted: false, reason: "google_not_connected", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Google účet není připojený",
            detail: "Pro mazání událostí v Google Kalendáři je potřeba připojit Google účet.",
            mode: "planned_integration",
          },
        },
      };
    }

    if (!hasCalendarWriteScope(options.googleToken)) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { deleted: false, reason: "missing_write_scope", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Nedostatečná oprávnění Google Calendar",
            detail:
              "Google účet je připojený pouze pro čtení. Pro mazání je potřeba Google účet znovu připojit s oprávněním ke kalendáři.",
            mode: "planned_integration",
          },
        },
      };
    }

    const rawDelete =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? (action.toolInput as Record<string, unknown>)
        : {};
    const deleteInput = DeleteCalendarEventInputSchema.parse(rawDelete);
    const deletedTitle =
      typeof rawDelete.eventTitle === "string" ? rawDelete.eventTitle : "Událost";

    try {
      await deleteGoogleCalendarEvent(options.googleToken, deleteInput);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Neznámá chyba";
      if (msg === "MISSING_WRITE_SCOPE") {
        return {
          toolName: action.toolName,
          toolInput: deleteInput,
          result: { deleted: false, reason: "missing_write_scope", isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "calendar",
            requiresConfirmation: false,
            source: {
              label: "Nedostatečná oprávnění Google Calendar",
              detail:
                "Pro mazání událostí je potřeba Google účet znovu připojit s oprávněním ke kalendáři.",
              mode: "planned_integration",
            },
          },
        };
      }
      if (msg === "EVENT_NOT_FOUND") {
        return {
          toolName: action.toolName,
          toolInput: deleteInput,
          result: { deleted: false, reason: "event_not_found", isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "calendar",
            requiresConfirmation: false,
            source: {
              label: "Událost nenalezena",
              detail: "Událost s tímto ID nebyla nalezena v Google Kalendáři.",
              mode: "live",
            },
          },
        };
      }
      throw err;
    }

    return {
      toolName: action.toolName,
      toolInput: deleteInput,
      result: { deleted: true, id: deleteInput.eventId, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "calendar",
        requiresConfirmation: false,
        source: {
          label: "Google Calendar",
          detail: `Událost '${deletedTitle}' byla smazána z Google Kalendáře.`,
          mode: "live",
        },
        artifact: {
          type: "table",
          title: "Smazaná událost",
          columns: ["položka", "hodnota"],
          rows: [
            { položka: "Název", hodnota: deletedTitle },
            { položka: "Stav", hodnota: "Smazáno" },
          ],
        },
      },
    };
  }

  if (action.toolName === "create_calendar_event") {
    if (!options?.googleToken) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { created: false, reason: "google_not_connected", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Google účet není připojený",
            detail: "Pro vytváření událostí v Google Kalendáři je potřeba nejdřív připojit Google účet.",
            mode: "planned_integration",
          },
        },
      };
    }

    if (!hasCalendarWriteScope(options.googleToken)) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { created: false, reason: "missing_write_scope", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Nedostatečná oprávnění Google Calendar",
            detail: "Google účet je připojený pouze pro čtení dostupnosti. Pro vytváření událostí je potřeba Google účet znovu připojit s oprávněním ke kalendáři.",
            mode: "planned_integration",
          },
        },
      };
    }

    const raw =
      typeof action.toolInput === "object" && action.toolInput !== null
        ? (action.toolInput as Record<string, unknown>)
        : {};
    const input = CreateCalendarEventInputSchema.parse(raw);
    const tz = input.timezone;

    // Backend guard: never create events in the past
    const startDate = new Date(input.startDateTime);
    if (startDate <= new Date()) {
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { created: false, reason: "past_datetime", isMock: false, isEmpty: true },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "calendar",
          requiresConfirmation: false,
          source: {
            label: "Termín v minulosti",
            detail: "Nelze vytvořit událost v minulosti. Zkuste zadat budoucí termín.",
            mode: "live",
          },
        },
      };
    }

    let event;
    try {
      event = await createGoogleCalendarEvent(options.googleToken, {
        title: input.title,
        startDateTime: input.startDateTime,
        endDateTime: input.endDateTime,
        timezone: tz,
        location: input.location,
        description: input.description,
        attendeeEmail: input.attendeeEmail,
        calendarId: input.calendarId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Neznámá chyba";
      if (msg === "MISSING_WRITE_SCOPE" || msg.includes("MISSING_WRITE_SCOPE")) {
        return {
          toolName: action.toolName,
          toolInput: input,
          result: { created: false, reason: "missing_write_scope", isMock: false, isEmpty: true },
          isMock: false,
          isEmpty: true,
          response: {
            intent: "calendar",
            requiresConfirmation: false,
            source: {
              label: "Nedostatečná oprávnění Google Calendar",
              detail: "Google účet je připojený pouze pro čtení dostupnosti. Pro vytváření událostí je potřeba Google účet znovu připojit s oprávněním ke kalendáři.",
              mode: "planned_integration",
            },
          },
        };
      }
      throw err;
    }

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { event, isMock: false, isEmpty: false },
      isMock: false,
      isEmpty: false,
      response: {
        intent: "calendar",
        requiresConfirmation: false,
        source: {
          label: "Google Calendar",
          detail: "Událost byla vytvořena v primárním Google Kalendáři.",
          mode: "live",
        },
        artifact: {
          type: "table",
          title: "Vytvořená událost",
          columns: ["položka", "hodnota"],
          rows: [
            { položka: "Název", hodnota: event.title },
            { položka: "Začátek", hodnota: event.startLocal },
            { položka: "Konec", hodnota: event.endLocal },
            ...(event.location ? [{ položka: "Místo", hodnota: event.location }] : []),
            ...(event.htmlLink ? [{ položka: "Odkaz", hodnota: event.htmlLink }] : []),
          ],
        },
      },
    };
  }

  // Gmail read tools (read-only, no confirmation required)
  if (action.toolName === "list_recent_emails") {
    const raw = typeof action.toolInput === "object" && action.toolInput !== null ? action.toolInput : {};
    const input = ListRecentEmailsInputSchema.parse(raw);
    try {
      const { emails, isEmpty } = await listRecentEmails(options?.googleToken, input);
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { emails, isEmpty, isMock: false },
        isMock: false,
        isEmpty,
        response: {
          intent: "email",
          requiresConfirmation: false,
          source: { label: "Gmail", detail: "Přečteno z Gmail API.", mode: "live" },
          artifact: isEmpty
            ? undefined
            : {
                type: "table",
                title: "E-maily",
                columns: ["Od", "Předmět", "Přijato", "Náhled"],
                rows: emails.map((e) => ({
                  Od: e.sender,
                  Předmět: e.subject,
                  Přijato: e.receivedAt,
                  Náhled: e.snippet.slice(0, 100),
                })),
              },
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chyba při čtení Gmail.";
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { error: msg },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "email",
          requiresConfirmation: false,
          source: { label: "Gmail", detail: msg, mode: "planned_integration" },
        },
      };
    }
  }

  if (action.toolName === "read_email") {
    const raw = typeof action.toolInput === "object" && action.toolInput !== null ? action.toolInput : {};
    const input = ReadEmailInputSchema.parse(raw);
    try {
      const { email, isEmpty } = await readEmail(options?.googleToken, input.messageId);
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { email, isEmpty, isMock: false },
        isMock: false,
        isEmpty,
        response: {
          intent: "email",
          requiresConfirmation: false,
          source: { label: "Gmail", detail: "Obsah e-mailu z Gmail API.", mode: "live" },
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chyba při čtení e-mailu.";
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { error: msg },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "email",
          requiresConfirmation: false,
          source: { label: "Gmail", detail: msg, mode: "planned_integration" },
        },
      };
    }
  }

  if (action.toolName === "search_emails") {
    const raw = typeof action.toolInput === "object" && action.toolInput !== null ? action.toolInput : {};
    const input = SearchEmailsInputSchema.parse(raw);
    try {
      const { emails, isEmpty } = await searchEmails(options?.googleToken, input.query, input.maxResults);
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { emails, isEmpty, isMock: false },
        isMock: false,
        isEmpty,
        response: {
          intent: "email",
          requiresConfirmation: false,
          source: { label: "Gmail", detail: `Výsledky hledání: ${input.query}`, mode: "live" },
          artifact: isEmpty
            ? undefined
            : {
                type: "table",
                title: `Výsledky: ${input.query}`,
                columns: ["Od", "Předmět", "Přijato", "Náhled"],
                rows: emails.map((e) => ({
                  Od: e.sender,
                  Předmět: e.subject,
                  Přijato: e.receivedAt,
                  Náhled: e.snippet.slice(0, 100),
                })),
              },
        },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Chyba při hledání v Gmail.";
      return {
        toolName: action.toolName,
        toolInput: input,
        result: { error: msg },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "email",
          requiresConfirmation: false,
          source: { label: "Gmail", detail: msg, mode: "planned_integration" },
        },
      };
    }
  }

  // Batch scheduled task creation
  if (action.toolName === "create_scheduled_tasks_batch") {
    const userId = options?.userId;
    if (!userId) {
      return {
        toolName: action.toolName,
        toolInput: action.toolInput,
        result: { created: 0, failed: 0, results: [], isMock: false },
        isMock: false,
        isEmpty: true,
        response: {
          intent: "general",
          requiresConfirmation: false,
          source: { label: "Přihlášení vyžadováno", detail: "Pro vytvoření úloh musíte být přihlášeni.", mode: "planned_integration" },
        },
      };
    }

    const raw = typeof action.toolInput === "object" && action.toolInput !== null ? action.toolInput : {};
    const input = CreateScheduledTasksBatchInputSchema.parse(raw);

    type BatchTaskResult = { ok: boolean; location: string; scheduleKind: string; reason?: string; qstash?: QStashOutcome };
    const results: BatchTaskResult[] = [];

    for (const taskInput of input.tasks) {
      try {
        const isOneTime = taskInput.schedule_kind === "one_time";
        if (isOneTime) {
          if (!taskInput.run_at) {
            results.push({ ok: false, location: taskInput.location, scheduleKind: "one_time", reason: "Chybí čas (run_at) pro jednorázovou úlohu." });
            continue;
          }
          if (new Date(taskInput.run_at) <= new Date()) {
            const localTime = new Intl.DateTimeFormat("cs-CZ", {
              timeZone: taskInput.timezone,
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(taskInput.run_at));
            results.push({ ok: false, location: taskInput.location, scheduleKind: "one_time", reason: `Čas ${localTime} už dnes uplynul.` });
            continue;
          }
        }
        const task = await createScheduledTask(userId, {
          ...taskInput,
          recipient_email: options?.userEmail,
        });
        const qstash: QStashOutcome = isOneTime
          ? await tryScheduleQStash(new Date(task.next_run_at))
          : { attempted: false, scheduled: false };
        results.push({ ok: true, location: taskInput.location, scheduleKind: taskInput.schedule_kind, qstash });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Chyba při vytváření úlohy.";
        results.push({ ok: false, location: taskInput.location, scheduleKind: taskInput.schedule_kind, reason: msg });
      }
    }

    const createdCount = results.filter((r) => r.ok).length;
    const failedCount = results.filter((r) => !r.ok).length;

    return {
      toolName: action.toolName,
      toolInput: input,
      result: { results, created: createdCount, failed: failedCount, isMock: false },
      isMock: false,
      isEmpty: createdCount === 0,
      response: {
        intent: "general",
        requiresConfirmation: false,
        source: {
          label: "Batch úlohy",
          detail: `Vytvořeno: ${createdCount}, selhalo: ${failedCount}`,
          mode: "live",
        },
      },
    };
  }

  throw new Error(`Unsupported agent tool: ${action.toolName}`);
}

function isValidRealEmail(to: string | null | undefined): to is string {
  if (!to || !to.includes("@")) return false;
  const t = to.toLowerCase().trim();
  return (
    !t.endsWith("@example.com") &&
    !t.startsWith("zajemce@") &&
    !t.startsWith("klient@") &&
    !t.startsWith("test@") &&
    !t.startsWith("recipient@")
  );
}

export async function runAgent(
  userMessage: string,
  options?: {
    googleToken?: StoredGoogleToken | null;
    history?: ChatHistoryItem[];
    userEmail?: string;
    userId?: string;
    confirmationToken?: string;
    pendingTool?: PendingTool;
    threadId?: string;
    lastEmailDraft?: { to: string | null; subject: string; body: string } | null;
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

  // Backend hard stop: standalone confirmation-like message with no pending action.
  // Three branches: (1) draft with valid recipient → send confirmation preview,
  // (2) draft without recipient → ask for recipient, (3) no draft → no pending action.
  // Must run before any Gemini call.
  if (!options?.pendingTool) {
    const normMsg = userMessage
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    const STANDALONE_CONFIRM_PHRASES = new Set([
      "ano", "jo", "jj", "ok", "yes", "confirm",
      "potvrzuji", "potvrdit", "souhlas", "souhlasim",
      "posli", "odesli", "odeslat",
      "posli to", "odesli to", "posli email", "odesli email",
      "ano posli", "ano odesli", "ano, posli", "ano, odesli",
      "ok posli", "ok odesli", "ok, posli", "ok, odesli",
      "proved", "zaloz", "vytvor",
    ]);
    if (STANDALONE_CONFIRM_PHRASES.has(normMsg)) {
      const lastDraft = options?.lastEmailDraft ?? null;

      if (lastDraft) {
        if (!isValidRealEmail(lastDraft.to)) {
          return {
            intent: "email",
            requiresConfirmation: false,
            emailDraft: lastDraft,
            message:
              "Mám připravený návrh e-mailu, ale chybí skutečná e-mailová adresa příjemce. Na jakou adresu ho mám poslat?",
          };
        }

        // Valid recipient — build send_email confirmation preview from the draft
        const draftPendingTool: PendingTool = {
          toolName: "send_email",
          payload: { to: lastDraft.to, subject: lastDraft.subject, body: lastDraft.body },
        };
        if (!options?.userId) {
          return {
            intent: "email",
            requiresConfirmation: false,
            message: "Akci nelze provést — uživatel není přihlášen.",
          };
        }
        const draftToken = generateConfirmationToken(options.userId, draftPendingTool, options.threadId);
        if (!draftToken) {
          return {
            intent: "email",
            requiresConfirmation: false,
            message: "Bezpečnostní potvrzení není nakonfigurované (chybí HMAC_SECRET). Akci nelze provést.",
          };
        }
        return {
          intent: "email",
          requiresConfirmation: true,
          emailDraft: lastDraft,
          message: `Připravil jsem e-mail k odeslání:\n\n**Komu:** ${lastDraft.to}\n**Předmět:** ${lastDraft.subject}\n\nText e-mailu:\n${lastDraft.body}\n\nMám tento e-mail odeslat? Potvrďte prosím 'ano pošli'.`,
          confirmationToken: draftToken,
          pendingTool: draftPendingTool,
        };
      }

      return {
        intent: "general",
        requiresConfirmation: false,
        message:
          "V tomto chatu není žádná akce k potvrzení. Napište prosím, co chcete udělat.",
      };
    }
  }

  // Confirmation response handling — classify user intent to avoid mechanical keyword matching.
  // pure_confirm → fast-path execute (skip Gemini re-generation to avoid payload drift).
  // reject → cancel immediately without calling Gemini.
  // confirm_with_modification / confirm_with_additional_request → re-route to Gemini with
  //   context about the original pending action so it can generate updated parameters.
  // question_or_unclear → fall through to Gemini normally.
  let pendingActionContextNote: string | null = null;

  if (options?.confirmationToken && options?.pendingTool) {
    const confirmIntent = classifyConfirmationIntent(userMessage);

    if (confirmIntent === "reject") {
      return {
        intent: "general",
        requiresConfirmation: false,
        message: "Dobře, akce byla zrušena. Jak vám mohu jinak pomoci?",
      };
    }

    if (confirmIntent === "pure_confirm") {
      const isAuthorized = verifyConfirmationToken(
        options.confirmationToken,
        options.userId ?? null,
        options.pendingTool,
        options.threadId,
      );

      if (!isAuthorized) {
        if (process.env.NODE_ENV !== "production") {
          console.log("[agent] confirmation fast-path: token INVALID (expired / wrong userId / payload mismatch)");
        }
        return {
          intent: "general",
          requiresConfirmation: false,
          message:
            "Potvrzení se nepodařilo ověřit — platnost mohla vypršet nebo byl změněn obsah akce. Zadejte akci znovu.",
        };
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`[agent] confirmation fast-path: token OK — executing ${options.pendingTool.toolName}`);
      }

      const confirmedAction: FunctionToolCall = {
        toolName: options.pendingTool.toolName as AgentToolName,
        toolInput: options.pendingTool.payload,
      };

      const confirmedExecution = await executeToolAction(userMessage, confirmedAction, {
        googleToken: options.googleToken,
        userEmail: options.userEmail,
        userId: options.userId,
        threadId: options.threadId,
      });

      return createTextResponse(
        buildConfirmedActionMessage(confirmedAction, confirmedExecution),
        [confirmedExecution],
      );
    }

    // confirm_with_modification or confirm_with_additional_request — user wants a change.
    // Inject context so Gemini knows what was originally planned and can adjust parameters.
    if (
      confirmIntent === "confirm_with_modification" ||
      confirmIntent === "confirm_with_additional_request"
    ) {
      pendingActionContextNote = `ÚPRAVA AKCE: Uživatel souhlasí s akcí "${options.pendingTool.toolName}", ale upravuje parametry. Původní parametry: ${JSON.stringify(options.pendingTool.payload)}. Zavolej tool s novými parametry podle uživatelovy úpravy — NEPOUŽÍVEJ původní parametry beze změny.`;
    }
    // question_or_unclear: fall through to Gemini with full conversation history
  }

  const capabilities = resolveCapabilities(options?.googleToken);
  const intent = classifyIntent(
    userMessage,
    !!(options?.confirmationToken && options?.pendingTool),
  );

  const { client, model } = createGeminiClient();
  const FALLBACK_MODEL = "gemini-2.5-flash";
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
  const _now = new Date();
  const _pragueTime = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
  }).format(_now);
  const _tzOffset =
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Prague",
      timeZoneName: "shortOffset",
    })
      .formatToParts(_now)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+2";
  // "GMT+2" → "+02:00", "GMT+1" → "+01:00"
  const _isoOffset = _tzOffset.replace(/^GMT([+-])(\d+)$/, (_, sign, h) => `${sign}${h.padStart(2, "0")}:00`);
  const _schedulerNote = isQStashConfigured()
    ? "Scheduler jednorázových úloh: QStash (aktivní) — one_time task proběhne přesně v zadaný čas. Říkej uživateli 'přijde přesně v [čas]'."
    : "Scheduler jednorázových úloh: denní batch Vercel cron 08:00 Praha — one_time task proběhne při nejbližším denním spuštění. NIKDY neslib přesný minutový čas; říkej 'zařadím to do fronty, spustí se nejdříve zítra ráno v 08:00'.";

  const systemInstruction = [
    CONVERSATIONAL_SYSTEM_INSTRUCTION,
    `Aktuální datum: ${_now.toISOString().slice(0, 10)}.`,
    `Aktuální čas (Europe/Prague): ${_pragueTime} (${_tzOffset}).`,
    `Google Calendar připojen: ${options?.googleToken ? "ano" : "ne"}.`,
    `Pro vytváření kalendářových událostí: startDateTime/endDateTime musí být RFC3339 s UTC offsetem, např. "2026-06-18T14:00:00${_isoOffset}".`,
    "Pro relativní datumy počítej rozsahy z aktuálního data výše.",
    _schedulerNote,
    pendingActionContextNote,
    intentToRouteHint(intent),
    buildCapabilityNote(capabilities, intent),
  ].filter(Boolean).join("\n");

  async function callGemini(activeModel: string, activeContents: Content[]) {
    return client.models.generateContent({
      model: activeModel,
      contents: activeContents,
      config: {
        systemInstruction,
        ...getFunctionCallingConfig(),
      },
    });
  }

  for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration += 1) {
    let response;
    try {
      response = await callGemini(model, contents);
    } catch (err) {
      const isModelError =
        err instanceof Error &&
        (err.message.includes("INVALID_ARGUMENT") ||
          err.message.includes("not found") ||
          err.message.includes("model") ||
          err.message.includes("thought_signature"));
      if (isModelError && model !== FALLBACK_MODEL) {
        console.error(`[runAgent] model=${model} failed (${(err as Error).message.slice(0, 120)}), falling back to ${FALLBACK_MODEL}`);
        response = await callGemini(FALLBACK_MODEL, contents);
      } else {
        throw err;
      }
    }
    const functionCalls = getFunctionCalls(response);

    if (process.env.NODE_ENV !== "production") {
      console.log(`[agent] iter=${iteration} tool_calls=${functionCalls.length}${functionCalls.length > 0 ? ` (${functionCalls.map((f) => f.name).join(", ")})` : ""}`);
    }

    if (functionCalls.length === 0) {
      return createTextResponse(verifyFinalMessage(response.text ?? "Hotovo."), executions);
    }

    // Preserve the full model response content including thoughtSignature parts.
    // Gemini 3.5+ with thinking enabled embeds thoughtSignature in content parts;
    // reconstructing only the functionCall parts strips it and causes a 400 on the next turn.
    const modelContent = response.candidates?.[0]?.content;
    contents.push(
      modelContent ?? {
        role: "model",
        parts: functionCalls.map((functionCall) => ({ functionCall })),
      },
    );

    for (const functionCall of functionCalls) {
      const action = createFunctionToolCall(functionCall);

      if (hasAlreadyRunAction(executions, action)) {
        return createTextResponse(
          "Už mám výsledek potřebného nástroje, proto stejný krok neopakuji.",
          executions,
        );
      }

      if (isConsequentialAction(action)) {
        const pendingTool: PendingTool = {
          toolName: action.toolName,
          payload: (action.toolInput ?? {}) as Record<string, unknown>,
        };
        const isAuthorized = verifyConfirmationToken(
          options?.confirmationToken,
          options?.userId,
          pendingTool,
          options?.threadId,
        );

        if (!isAuthorized) {
          const latestExecution = getLatestExecution(executions);
          const artifacts = getAllArtifacts(executions);

          if (!options?.userId) {
            return {
              intent: latestExecution?.response.intent ?? "general",
              requiresConfirmation: false,
              message: "Akci nelze provést — uživatel není přihlášen.",
            };
          }

          const token = generateConfirmationToken(options.userId, pendingTool, options.threadId);

          if (!token) {
            if (process.env.NODE_ENV !== "production") {
              console.log(`[agent] BLOCKED consequential ${action.toolName} — HMAC_SECRET not configured`);
            }
            return {
              intent: latestExecution?.response.intent ?? "general",
              requiresConfirmation: false,
              message: "Bezpečnostní potvrzení není nakonfigurované (chybí HMAC_SECRET). Akci nelze provést.",
            };
          }

          if (process.env.NODE_ENV !== "production") {
            console.log(`[agent] intercepted consequential: ${action.toolName} → token generated`);
          }

          const emailDraftForConfirmation =
            action.toolName === "send_email"
              ? (extractSendEmailFields(action.toolInput) ?? latestExecution?.response.emailDraft)
              : latestExecution?.response.emailDraft;

          return {
            intent: latestExecution?.response.intent ?? "general",
            requiresConfirmation: true,
            source: latestExecution?.response.source,
            artifacts: artifacts.length > 0 ? artifacts : undefined,
            emailDraft: emailDraftForConfirmation,
            message: buildConfirmationMessage(action),
            confirmationToken: token,
            pendingTool,
          };
        }

        if (process.env.NODE_ENV !== "production") {
          console.log(`[agent] token verified — executing confirmed: ${action.toolName}`);
        }
      }

      const execution = await executeToolAction(userMessage, action, {
        googleToken: options?.googleToken,
        userEmail: options?.userEmail,
        userId: options?.userId,
        threadId: options?.threadId,
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
