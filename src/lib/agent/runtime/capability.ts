import {
  hasScope,
  SCOPE_GMAIL_READ,
  SCOPE_GMAIL_SEND,
  SCOPE_CALENDAR_READ,
  SCOPE_CALENDAR_EVENTS,
} from "@/lib/google/scopes";
import type { AgentIntent } from "./intent";

export type GoogleToken = {
  accessToken?: string | null;
  scope?: string | null;
  refreshToken?: string | null;
};

export type Capabilities = {
  gmailRead: boolean;
  gmailSend: boolean;
  calendarRead: boolean;
  calendarWrite: boolean;
  internalData: boolean;
  webSearch: boolean;
  scheduler: boolean;
  qstashExactScheduling: boolean;
};

export function resolveCapabilities(googleToken: GoogleToken | null | undefined): Capabilities {
  const hasToken = !!(googleToken?.accessToken ?? googleToken?.refreshToken);
  const scope = googleToken?.scope ?? "";

  return {
    gmailRead: hasToken && hasScope(scope, SCOPE_GMAIL_READ),
    gmailSend: hasToken && hasScope(scope, SCOPE_GMAIL_SEND),
    calendarRead: hasToken && hasScope(scope, SCOPE_CALENDAR_READ),
    calendarWrite: hasToken && hasScope(scope, SCOPE_CALENDAR_EVENTS),
    internalData: true,
    webSearch: !!process.env.FIRECRAWL_API_KEY,
    scheduler: true,
    qstashExactScheduling: !!(process.env.QSTASH_TOKEN && process.env.QSTASH_URL),
  };
}

export function buildCapabilityNote(caps: Capabilities, intent: AgentIntent): string | null {
  if (intent === "email_read" && !caps.gmailRead) {
    return "VAROVÁNÍ: Gmail není připojený nebo chybí gmail.readonly. Pokud uživatel chce číst poštu, oznám to a navrhni připojení Google účtu.";
  }
  if (intent === "email_send" && !caps.gmailSend) {
    return "VAROVÁNÍ: Gmail není připojený nebo chybí gmail.send. Pokud uživatel chce poslat e-mail, oznám to a navrhni připojení Google účtu.";
  }
  if (intent === "email_draft" && !caps.gmailSend) {
    return "UPOZORNĚNÍ: Gmail není připojený. Můžeš napsat návrh e-mailu, ale odeslání nebude možné bez připojeného Google účtu.";
  }
  if ((intent === "calendar_read" || intent === "calendar_write") && !caps.calendarRead) {
    return "VAROVÁNÍ: Google Calendar není připojený. Pokud uživatel chce pracovat s kalendářem, oznám to a navrhni připojení přes /auth/google.";
  }
  if (intent === "web_search" && !caps.webSearch) {
    return "VAROVÁNÍ: Firecrawl API není nakonfigurované. Vyhledávání na realitních portálech není dostupné.";
  }
  return null;
}
