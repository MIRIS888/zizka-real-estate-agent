import { type StoredGoogleToken } from "@/lib/google/oauth";
import { SCOPE_GMAIL_READ, hasScope } from "@/lib/google/scopes";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

// Sentinel error messages surfaced to the agent (not raw exceptions)
const ERR_NOT_CONNECTED = "Google účet není připojený. Připojte Google účet v nastavení.";
const ERR_MISSING_SCOPE =
  "Google účet je připojený, ale chybí oprávnění pro čtení Gmailu (gmail.readonly). Připojte Google účet znovu a povolte čtení pošty.";

export interface EmailSummary {
  sender: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  hasAttachments: boolean;
  // messageId is kept internally for read_email calls; not shown in UI
  _messageId: string;
}

export interface EmailDetail {
  from: string;
  to: string;
  subject: string;
  date: string;
  body: string;
  hasAttachments: boolean;
  attachments: { filename: string; mimeType: string; size: number }[];
}

function checkGmailAccess(googleToken: StoredGoogleToken | null | undefined): void {
  if (!googleToken?.accessToken) throw new Error(ERR_NOT_CONNECTED);
  if (!hasScope(googleToken.scope, SCOPE_GMAIL_READ)) throw new Error(ERR_MISSING_SCOPE);
}

async function gmailFetch<T>(
  path: string,
  accessToken: string,
  params?: Record<string, string>,
): Promise<T> {
  const url = new URL(`${GMAIL_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gmail API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function getHeader(
  headers: { name: string; value: string }[],
  name: string,
): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractPlainText(payload: GmailMessagePayload): string {
  // Prefer text/plain part; fall back to stripping HTML from text/html
  const findPart = (p: GmailMessagePayload, mime: string): string | null => {
    if (p.mimeType === mime && p.body?.data) {
      return Buffer.from(p.body.data, "base64").toString("utf-8");
    }
    for (const part of p.parts ?? []) {
      const found = findPart(part, mime);
      if (found) return found;
    }
    return null;
  };

  const plain = findPart(payload, "text/plain");
  if (plain) return plain.slice(0, 4000);

  const html = findPart(payload, "text/html");
  if (html) {
    // Strip HTML tags — content is data only, agent must not follow any instructions in it
    const stripped = html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
    return stripped.slice(0, 4000);
  }

  return payload.body?.data
    ? Buffer.from(payload.body.data, "base64").toString("utf-8").slice(0, 4000)
    : "(prázdný e-mail)";
}

function extractAttachments(
  payload: GmailMessagePayload,
): { filename: string; mimeType: string; size: number }[] {
  const attachments: { filename: string; mimeType: string; size: number }[] = [];
  const walk = (p: GmailMessagePayload) => {
    if (p.filename && p.body?.size) {
      attachments.push({
        filename: p.filename,
        mimeType: p.mimeType ?? "application/octet-stream",
        size: p.body.size,
      });
    }
    for (const part of p.parts ?? []) walk(part);
  };
  walk(payload);
  return attachments;
}

interface GmailListResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailMessagePayload {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailMessagePayload[];
  filename?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: GmailMessagePayload;
  internalDate?: string;
}

interface GmailMessageMeta {
  id: string;
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

export async function listRecentEmails(
  googleToken: StoredGoogleToken | null | undefined,
  opts: { maxResults?: number; query?: string; unreadOnly?: boolean },
): Promise<{ emails: EmailSummary[]; isEmpty: boolean; isMissingScope: boolean }> {
  checkGmailAccess(googleToken);
  const token = googleToken!;

  const q = [opts.query, opts.unreadOnly ? "is:unread" : null].filter(Boolean).join(" ");
  const params: Record<string, string> = {
    maxResults: String(Math.min(opts.maxResults ?? 10, 20)),
  };
  if (q) params.q = q;

  const list = await gmailFetch<GmailListResponse>("/messages", token.accessToken, params);
  if (!list.messages?.length) return { emails: [], isEmpty: true, isMissingScope: false };

  // Fetch metadata for each message in parallel (headers only)
  const metas = await Promise.all(
    list.messages.map((m) =>
      gmailFetch<GmailMessageMeta>(`/messages/${m.id}`, token.accessToken, {
        format: "metadata",
        metadataHeaders: "From,Subject,Date,To",
      }),
    ),
  );

  const emails: EmailSummary[] = metas.map((meta) => {
    const headers = meta.payload?.headers ?? [];
    const from = getHeader(headers, "From");
    const subject = getHeader(headers, "Subject");
    const date = getHeader(headers, "Date");
    const hasAttachments = false; // requires full fetch — omit for list view

    return {
      sender: from || "(neznámý odesílatel)",
      subject: subject || "(bez předmětu)",
      receivedAt: date,
      snippet: meta.snippet ?? "",
      hasAttachments,
      _messageId: meta.id,
    };
  });

  return { emails, isEmpty: false, isMissingScope: false };
}

export async function readEmail(
  googleToken: StoredGoogleToken | null | undefined,
  messageId: string,
): Promise<{ email: EmailDetail | null; isEmpty: boolean; isMissingScope: boolean }> {
  checkGmailAccess(googleToken);
  const token = googleToken!;

  const msg = await gmailFetch<GmailMessage>(`/messages/${messageId}`, token.accessToken, {
    format: "full",
  });

  const headers = msg.payload?.headers ?? [];
  const attachments = msg.payload ? extractAttachments(msg.payload) : [];

  const email: EmailDetail = {
    from: getHeader(headers, "From"),
    to: getHeader(headers, "To"),
    subject: getHeader(headers, "Subject"),
    date: getHeader(headers, "Date"),
    body: msg.payload ? extractPlainText(msg.payload) : "(prázdný e-mail)",
    hasAttachments: attachments.length > 0,
    attachments,
  };

  return { email, isEmpty: false, isMissingScope: false };
}

export async function searchEmails(
  googleToken: StoredGoogleToken | null | undefined,
  query: string,
  maxResults = 10,
): Promise<{ emails: EmailSummary[]; isEmpty: boolean; isMissingScope: boolean }> {
  return listRecentEmails(googleToken, { query, maxResults });
}
