import { getGoogleOAuthEnvironment, isGoogleOAuthConfigured } from "@/lib/env";

export type GoogleCalendarSlot = {
  startsAt: string;
  endsAt: string;
  label: string;
};

export type GoogleCalendarBusySlot = {
  startsAt: string;
  endsAt: string;
  label: string;
};

export type GoogleCalendarFreeWindow = {
  startsAt: string;
  endsAt: string;
  label: string;
  durationMinutes: number;
};

export type GoogleCalendarAvailability = {
  busySlots: GoogleCalendarBusySlot[];
  freeWindows: GoogleCalendarFreeWindow[];
  freeSlots: GoogleCalendarSlot[];
};

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

export type StoredGoogleToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
};

type CalendarSlotSearchOptions = {
  dateRange?: {
    from: string;
    to: string;
  };
  durationMinutes?: number;
  timezone?: string;
};

type GoogleTokenStore = {
  token: StoredGoogleToken | null;
};

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const GOOGLE_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_CALENDAR_LIST_URL =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const GOOGLE_CALENDAR_EVENTS_URL = (calendarId: string) =>
  `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
import { GOOGLE_OAUTH_SCOPES } from "./scopes";
const SCOPES = [...GOOGLE_OAUTH_SCOPES];
export const GOOGLE_TOKEN_COOKIE = "zizka_google_token";

const globalForGoogle = globalThis as typeof globalThis & {
  googleTokenStore?: GoogleTokenStore;
};

const tokenStore =
  globalForGoogle.googleTokenStore ?? (globalForGoogle.googleTokenStore = { token: null });

function toStoredToken(response: GoogleTokenResponse): StoredGoogleToken {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt: response.expires_in
      ? Date.now() + response.expires_in * 1000
      : undefined,
    scope: response.scope,
  };
}

export function encodeGoogleToken(token: StoredGoogleToken) {
  return Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
}

export function decodeGoogleToken(value?: string): StoredGoogleToken | null {
  if (!value) {
    return null;
  }

  try {
    const parsedValue = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<StoredGoogleToken>;

    if (!parsedValue.accessToken) {
      return null;
    }

    return {
      accessToken: parsedValue.accessToken,
      refreshToken: parsedValue.refreshToken,
      expiresAt: parsedValue.expiresAt,
      scope: parsedValue.scope,
    };
  } catch {
    return null;
  }
}

function formatSlotLabel(date: Date, timeZone = "Europe/Prague") {
  return new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
}

function formatBusySlotLabel(start: Date, end: Date, timeZone: string) {
  const dateLabel = new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "numeric",
    timeZone,
  }).format(start);
  const timeFormatter = new Intl.DateTimeFormat("cs-CZ", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  return `${dateLabel}, ${timeFormatter.format(start)}-${timeFormatter.format(end)}`;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  });
  const timeZoneName = formatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = timeZoneName?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function createDateInTimeZone(
  date: Date,
  hour: number,
  minute: number,
  timeZone: string,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offsetMinutes = getTimeZoneOffsetMinutes(utcGuess, timeZone);

  return new Date(utcGuess.getTime() - offsetMinutes * 60 * 1000);
}

function addDaysInTimeZone(date: Date, days: number, timeZone: string) {
  const noon = createDateInTimeZone(date, 12, 0, timeZone);
  noon.setUTCDate(noon.getUTCDate() + days);

  return noon;
}

function getWeekdayInTimeZone(date: Date, timeZone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);

  return weekday;
}

function overlapsBusySlot(start: Date, end: Date, busySlots: Array<{ start: string; end: string }>) {
  return busySlots.some((slot) => {
    const busyStart = new Date(slot.start);
    const busyEnd = new Date(slot.end);

    return start < busyEnd && end > busyStart;
  });
}

function getMinutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

function getFreeWindowsForDay(
  day: Date,
  timeMin: Date,
  timeMax: Date,
  busySlots: Array<{ start: string; end: string }>,
  timeZone: string,
) {
  const workStart = createDateInTimeZone(day, 9, 0, timeZone);
  const workEnd = createDateInTimeZone(day, 17, 0, timeZone);
  const windowStart = new Date(Math.max(workStart.getTime(), timeMin.getTime()));
  const windowEnd = new Date(Math.min(workEnd.getTime(), timeMax.getTime()));

  if (windowStart >= windowEnd) {
    return [];
  }

  const clippedBusySlots = busySlots
    .map((slot) => ({
      start: new Date(Math.max(new Date(slot.start).getTime(), windowStart.getTime())),
      end: new Date(Math.min(new Date(slot.end).getTime(), windowEnd.getTime())),
    }))
    .filter((slot) => slot.start < slot.end)
    .sort((left, right) => left.start.getTime() - right.start.getTime());
  const freeWindows: GoogleCalendarFreeWindow[] = [];
  let cursor = windowStart;

  for (const busySlot of clippedBusySlots) {
    if (cursor < busySlot.start) {
      freeWindows.push({
        startsAt: cursor.toISOString(),
        endsAt: busySlot.start.toISOString(),
        label: formatBusySlotLabel(cursor, busySlot.start, timeZone),
        durationMinutes: getMinutesBetween(cursor, busySlot.start),
      });
    }

    if (cursor < busySlot.end) {
      cursor = busySlot.end;
    }
  }

  if (cursor < windowEnd) {
    freeWindows.push({
      startsAt: cursor.toISOString(),
      endsAt: windowEnd.toISOString(),
      label: formatBusySlotLabel(cursor, windowEnd, timeZone),
      durationMinutes: getMinutesBetween(cursor, windowEnd),
    });
  }

  return freeWindows;
}

async function getGoogleCalendarIds(accessToken: string) {
  const response = await fetch(GOOGLE_CALENDAR_LIST_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return ["primary"];
  }

  const payload = (await response.json()) as {
    items?: Array<{
      id?: string;
      hidden?: boolean;
      selected?: boolean;
    }>;
  };
  const calendarIds =
    payload.items
      ?.filter((calendar) => calendar.id && !calendar.hidden && calendar.selected !== false)
      .map((calendar) => calendar.id as string) ?? [];

  return calendarIds.length > 0 ? calendarIds : ["primary"];
}

export function getGoogleConnectionStatus(token?: StoredGoogleToken | null) {
  const activeToken = token ?? tokenStore.token;

  return {
    configured: isGoogleOAuthConfigured(),
    connected: Boolean(activeToken?.refreshToken || activeToken?.accessToken),
    scopes: activeToken?.scope?.split(" ") ?? [],
  };
}

export function disconnectGoogleAccount() {
  tokenStore.token = null;
}

export function createGoogleAuthorizationUrl(redirectUri: string) {
  const environment = getGoogleOAuthEnvironment();
  const parameters = new URLSearchParams({
    client_id: environment.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_URL}?${parameters.toString()}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const environment = getGoogleOAuthEnvironment();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: environment.GOOGLE_CLIENT_ID,
      client_secret: environment.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error("Google OAuth token exchange failed.");
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  tokenStore.token = toStoredToken(payload);

  return tokenStore.token;
}

// Exported for use by cron token-store: refreshes a token and returns the full updated token.
// Does NOT update tokenStore (in-memory) — callers manage persistence themselves.
export async function refreshGoogleToken(token: StoredGoogleToken): Promise<StoredGoogleToken> {
  if (!token.refreshToken) return token;
  if (token.expiresAt && token.expiresAt > Date.now() + 60_000) return token;

  const environment = getGoogleOAuthEnvironment();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: environment.GOOGLE_CLIENT_ID,
      client_secret: environment.GOOGLE_CLIENT_SECRET,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Google OAuth token refresh failed.");
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  return {
    ...token,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? token.refreshToken,
    expiresAt: payload.expires_in ? Date.now() + payload.expires_in * 1000 : token.expiresAt,
    scope: payload.scope ?? token.scope,
  };
}

async function refreshAccessToken(token: StoredGoogleToken) {
  if (!token.refreshToken) {
    return token.accessToken;
  }

  if (token.expiresAt && token.expiresAt > Date.now() + 60_000) {
    return token.accessToken;
  }

  const refreshed = await refreshGoogleToken(token);
  tokenStore.token = refreshed;
  return refreshed.accessToken;
}

export async function findGoogleCalendarSlots(
  token?: StoredGoogleToken | null,
  options?: CalendarSlotSearchOptions,
): Promise<GoogleCalendarSlot[] | null> {
  const availability = await findGoogleCalendarAvailability(token, options);

  return availability?.freeSlots ?? null;
}

// Minimum buffer before a slot can be suggested — prevents proposing times that are too soon or already past
const SLOT_BUFFER_MINUTES = 60;

export async function findGoogleCalendarAvailability(
  token?: StoredGoogleToken | null,
  options?: CalendarSlotSearchOptions,
): Promise<GoogleCalendarAvailability | null> {
  const activeToken = token ?? tokenStore.token;

  if (!activeToken) {
    return null;
  }

  const accessToken = await refreshAccessToken(activeToken);
  const calendarIds = await getGoogleCalendarIds(accessToken);
  const timezone = options?.timezone ?? "Europe/Prague";
  const now = new Date();
  // minStart: absolute earliest datetime we'll ever suggest — now + safety buffer
  const minStart = new Date(now.getTime() + SLOT_BUFFER_MINUTES * 60_000);
  const requestedStart = options?.dateRange?.from
    ? createDateInTimeZone(new Date(`${options.dateRange.from}T12:00:00Z`), 0, 0, timezone)
    : now;
  // Clamp FreeBusy query start to now so we don't query already-elapsed time
  const timeMin = requestedStart < now ? now : requestedStart;
  const timeMax = options?.dateRange?.to
    ? createDateInTimeZone(new Date(`${options.dateRange.to}T12:00:00Z`), 23, 59, timezone)
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const durationMinutes = options?.durationMinutes ?? 45;
  const response = await fetch(GOOGLE_FREEBUSY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: timezone,
      items: calendarIds.map((id) => ({ id })),
    }),
  });

  if (!response.ok) {
    throw new Error("Google Calendar availability could not be loaded.");
  }

  const payload = (await response.json()) as {
    calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
  };
  const rawBusySlots = Object.values(payload.calendars ?? {}).flatMap(
    (calendar) => calendar.busy ?? [],
  );
  const busySlots = rawBusySlots
    .map((slot) => ({
      startsAt: slot.start,
      endsAt: slot.end,
      label: formatBusySlotLabel(new Date(slot.start), new Date(slot.end), timezone),
    }))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const freeWindows: GoogleCalendarFreeWindow[] = [];
  const freeSlots: GoogleCalendarSlot[] = [];

  for (let dayOffset = 0; dayOffset <= 14 && freeSlots.length < 3; dayOffset += 1) {
    const day = addDaysInTimeZone(timeMin, dayOffset, timezone);
    const weekday = getWeekdayInTimeZone(day, timezone);

    if (weekday === "Sat" || weekday === "Sun") {
      continue;
    }

    freeWindows.push(
      ...getFreeWindowsForDay(day, timeMin, timeMax, rawBusySlots, timezone),
    );

    for (const hour of [9, 10, 11, 14, 15, 16]) {
      const start = createDateInTimeZone(day, hour, 0, timezone);

      // Use minStart (not timeMin) — backend guard: never suggest a slot in the past or too close to now
      if (start <= minStart || start >= timeMax) {
        continue;
      }

      const end = addMinutes(start, durationMinutes);

      if (end <= timeMax && !overlapsBusySlot(start, end, rawBusySlots)) {
        freeSlots.push({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          label: formatSlotLabel(start, timezone),
        });
      }
    }
  }

  return { busySlots, freeWindows, freeSlots };
}

export function hasCalendarWriteScope(token: StoredGoogleToken): boolean {
  const scopes = (token.scope ?? "").split(" ");
  return (
    scopes.includes("https://www.googleapis.com/auth/calendar") ||
    scopes.includes("https://www.googleapis.com/auth/calendar.events")
  );
}

export type GoogleCalendarEventInput = {
  title: string;
  startDateTime: string;
  endDateTime: string;
  timezone?: string;
  location?: string;
  description?: string;
  attendeeEmail?: string;
  calendarId?: string;
};

export type GoogleCalendarEventResult = {
  id: string;
  title: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  location?: string;
  htmlLink?: string;
  created: true;
};

export async function createGoogleCalendarEvent(
  token: StoredGoogleToken,
  input: GoogleCalendarEventInput,
): Promise<GoogleCalendarEventResult> {
  if (!hasCalendarWriteScope(token)) {
    throw new Error("MISSING_WRITE_SCOPE");
  }

  const accessToken = await refreshAccessToken(token);
  const calendarId = input.calendarId ?? "primary";
  const timezone = input.timezone ?? "Europe/Prague";

  const body: Record<string, unknown> = {
    summary: input.title,
    start: { dateTime: input.startDateTime, timeZone: timezone },
    end: { dateTime: input.endDateTime, timeZone: timezone },
  };

  if (input.location) body.location = input.location;
  if (input.description) body.description = input.description;
  if (input.attendeeEmail) body.attendees = [{ email: input.attendeeEmail }];

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    const msg = errorPayload.error?.message ?? `HTTP ${response.status}`;
    const status = errorPayload.error?.status;
    if (status === "PERMISSION_DENIED" || response.status === 403) {
      throw new Error("MISSING_WRITE_SCOPE");
    }
    throw new Error(`Google Calendar: ${msg}`);
  }

  const event = (await response.json()) as {
    id?: string;
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    location?: string;
    htmlLink?: string;
  };

  const fmtLocal = (dt?: string) => {
    if (!dt) return "";
    return new Intl.DateTimeFormat("cs-CZ", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dt));
  };

  return {
    id: event.id ?? "",
    title: event.summary ?? input.title,
    startLocal: fmtLocal(event.start?.dateTime),
    endLocal: fmtLocal(event.end?.dateTime),
    timezone,
    location: event.location,
    htmlLink: event.htmlLink,
    created: true,
  };
}

// ─── Calendar event types ───────────────────────────────────────────────────

export type CalendarEventSummary = {
  id: string;
  title: string;
  startDateTime: string;
  endDateTime: string;
  dateLabel: string;
  timeLabel: string;
  location?: string;
  description?: string;
  attendees: string[];
  htmlLink?: string;
  calendarId: string;
};

export type FindCalendarEventsInput = {
  query?: string;
  dateRange?: { start: string; end: string };
  personName?: string;
  location?: string;
  calendarId?: string;
  timezone?: string;
  maxResults?: number;
};

export type UpdateCalendarEventInput = {
  eventId: string;
  eventTitle?: string;
  calendarId?: string;
  title?: string;
  startDateTime?: string;
  endDateTime?: string;
  timezone?: string;
  location?: string;
  description?: string;
  attendeeEmail?: string;
  sendUpdates?: "all" | "externalOnly" | "none";
};

export type DeleteCalendarEventInput = {
  eventId: string;
  eventTitle?: string;
  calendarId?: string;
  sendUpdates?: "all" | "externalOnly" | "none";
};

export type UpdateCalendarEventResult = {
  id: string;
  title: string;
  startLocal: string;
  endLocal: string;
  timezone: string;
  location?: string;
  htmlLink?: string;
  updated: true;
};

// ─── Calendar formatting helpers ─────────────────────────────────────────────

function formatEventDateLabel(dt: string, timezone: string): string {
  if (!dt) return "";
  const date = new Date(dt);
  const today = new Date();
  const toDateKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d);

  const formatted = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);

  if (toDateKey(date) === toDateKey(today)) return `dnes, ${formatted}`;
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  if (toDateKey(date) === toDateKey(tomorrow)) return `zítra, ${formatted}`;
  return formatted;
}

function formatEventTimeLabel(startDT: string, endDT: string, timezone: string): string {
  if (!startDT) return "";
  const timeFmt = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const start = new Date(startDT);
  if (!endDT) return timeFmt.format(start);
  return `${timeFmt.format(start)}–${timeFmt.format(new Date(endDT))}`;
}

function toTimeMin(dateStr: string, timezone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return createDateInTimeZone(new Date(dateStr + "T12:00:00Z"), 0, 0, timezone).toISOString();
  }
  return new Date(dateStr).toISOString();
}

function toTimeMax(dateStr: string, timezone: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return createDateInTimeZone(new Date(dateStr + "T12:00:00Z"), 23, 59, timezone).toISOString();
  }
  return new Date(dateStr).toISOString();
}

// ─── Calendar event operations ────────────────────────────────────────────────

export async function findGoogleCalendarEvents(
  token: StoredGoogleToken,
  input: FindCalendarEventsInput,
): Promise<{ events: CalendarEventSummary[]; isEmpty: boolean; isMock: false }> {
  const accessToken = await refreshAccessToken(token);
  const calendarId = input.calendarId ?? "primary";
  const timezone = input.timezone ?? "Europe/Prague";
  const maxResults = input.maxResults ?? 10;

  const queryParts: string[] = [];
  if (input.query) queryParts.push(input.query);
  if (input.personName) queryParts.push(input.personName);
  const q = queryParts.join(" ") || undefined;

  const now = new Date();
  const timeMin = input.dateRange?.start
    ? toTimeMin(input.dateRange.start, timezone)
    : now.toISOString();
  const timeMax = input.dateRange?.end
    ? toTimeMax(input.dateRange.end, timezone)
    : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(maxResults),
    timeMin,
    timeMax,
  });
  if (q) params.set("q", q);
  if (input.location) params.set("q", [q, input.location].filter(Boolean).join(" "));

  const url = `${GOOGLE_CALENDAR_EVENTS_URL(calendarId)}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    if (errPayload.error?.status === "PERMISSION_DENIED" || response.status === 403) {
      throw new Error("MISSING_READ_SCOPE");
    }
    throw new Error(`Google Calendar: ${errPayload.error?.message ?? `HTTP ${response.status}`}`);
  }

  const payload = (await response.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      location?: string;
      description?: string;
      attendees?: Array<{ email?: string; displayName?: string }>;
      htmlLink?: string;
    }>;
  };

  const events: CalendarEventSummary[] = (payload.items ?? []).map((item) => {
    const startDT = item.start?.dateTime ?? item.start?.date ?? "";
    const endDT = item.end?.dateTime ?? item.end?.date ?? "";
    return {
      id: item.id ?? "",
      title: item.summary ?? "(bez názvu)",
      startDateTime: startDT,
      endDateTime: endDT,
      dateLabel: formatEventDateLabel(startDT, timezone),
      timeLabel: formatEventTimeLabel(startDT, endDT, timezone),
      location: item.location,
      description: item.description,
      attendees: (item.attendees ?? []).map((a) => a.displayName ?? a.email ?? "").filter(Boolean),
      htmlLink: item.htmlLink,
      calendarId,
    };
  });

  return { events, isEmpty: events.length === 0, isMock: false };
}

export async function updateGoogleCalendarEvent(
  token: StoredGoogleToken,
  input: UpdateCalendarEventInput,
): Promise<UpdateCalendarEventResult> {
  if (!hasCalendarWriteScope(token)) {
    throw new Error("MISSING_WRITE_SCOPE");
  }

  const accessToken = await refreshAccessToken(token);
  const calendarId = input.calendarId ?? "primary";
  const timezone = input.timezone ?? "Europe/Prague";
  const sendUpdates = input.sendUpdates ?? "none";

  const patch: Record<string, unknown> = {};
  if (input.title) patch.summary = input.title;
  if (input.startDateTime) patch.start = { dateTime: input.startDateTime, timeZone: timezone };
  if (input.endDateTime) patch.end = { dateTime: input.endDateTime, timeZone: timezone };
  if (input.location !== undefined) patch.location = input.location;
  if (input.description !== undefined) patch.description = input.description;
  if (input.attendeeEmail) patch.attendees = [{ email: input.attendeeEmail }];

  const url = `${GOOGLE_CALENDAR_EVENTS_URL(calendarId)}/${encodeURIComponent(input.eventId)}?sendUpdates=${sendUpdates}`;
  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const errPayload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; status?: string };
    };
    if (errPayload.error?.status === "PERMISSION_DENIED" || response.status === 403) {
      throw new Error("MISSING_WRITE_SCOPE");
    }
    if (response.status === 404) throw new Error("EVENT_NOT_FOUND");
    throw new Error(`Google Calendar: ${errPayload.error?.message ?? `HTTP ${response.status}`}`);
  }

  const event = (await response.json()) as {
    id?: string;
    summary?: string;
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    location?: string;
    htmlLink?: string;
  };

  const fmtLocal = (dt?: string) => {
    if (!dt) return "";
    return new Intl.DateTimeFormat("cs-CZ", {
      timeZone: timezone,
      weekday: "long",
      day: "numeric",
      month: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dt));
  };

  return {
    id: event.id ?? input.eventId,
    title: event.summary ?? input.title ?? "",
    startLocal: fmtLocal(event.start?.dateTime),
    endLocal: fmtLocal(event.end?.dateTime),
    timezone,
    location: event.location,
    htmlLink: event.htmlLink,
    updated: true,
  };
}

export async function deleteGoogleCalendarEvent(
  token: StoredGoogleToken,
  input: DeleteCalendarEventInput,
): Promise<{ deleted: true; id: string }> {
  if (!hasCalendarWriteScope(token)) {
    throw new Error("MISSING_WRITE_SCOPE");
  }

  const accessToken = await refreshAccessToken(token);
  const calendarId = input.calendarId ?? "primary";
  const sendUpdates = input.sendUpdates ?? "none";

  const url = `${GOOGLE_CALENDAR_EVENTS_URL(calendarId)}/${encodeURIComponent(input.eventId)}?sendUpdates=${sendUpdates}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 404) throw new Error("EVENT_NOT_FOUND");
    if (response.status === 403) throw new Error("MISSING_WRITE_SCOPE");
    const errPayload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(`Google Calendar: ${errPayload.error?.message ?? `HTTP ${response.status}`}`);
  }

  return { deleted: true, id: input.eventId };
}

// ─── Gmail ───────────────────────────────────────────────────────────────────

const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as { email?: string };
  return payload.email ?? null;
}

export async function sendGmailMessage(
  token: StoredGoogleToken,
  options: { to: string; subject: string; body: string; html?: string },
): Promise<{ messageId: string }> {
  const accessToken = await refreshAccessToken(token);
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(options.subject, "utf8").toString("base64")}?=`;

  let rawMessage: string;

  if (options.html) {
    const boundary = "zizka_mime_v1";
    const textEncoded = Buffer.from(options.body, "utf8").toString("base64");
    const htmlEncoded = Buffer.from(options.html, "utf8").toString("base64");
    rawMessage = [
      `To: ${options.to}`,
      `Subject: ${subjectEncoded}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      textEncoded,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      htmlEncoded,
      `--${boundary}--`,
    ].join("\r\n");
  } else {
    const bodyEncoded = Buffer.from(options.body, "utf8").toString("base64");
    rawMessage = [
      `To: ${options.to}`,
      `Subject: ${subjectEncoded}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      bodyEncoded,
    ].join("\r\n");
  }

  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: Buffer.from(rawMessage, "utf8").toString("base64url") }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gmail send failed: ${errorText}`);
  }

  const result = (await response.json()) as { id: string };
  return { messageId: result.id };
}
