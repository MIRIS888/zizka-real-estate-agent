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
const GOOGLE_FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy";
const GOOGLE_CALENDAR_LIST_URL =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList";
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
];
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

export function createGoogleAuthorizationUrl() {
  const environment = getGoogleOAuthEnvironment();
  const parameters = new URLSearchParams({
    client_id: environment.GOOGLE_CLIENT_ID,
    redirect_uri: environment.GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });

  return `${GOOGLE_AUTH_URL}?${parameters.toString()}`;
}

export async function exchangeGoogleCode(code: string) {
  const environment = getGoogleOAuthEnvironment();
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: environment.GOOGLE_CLIENT_ID,
      client_secret: environment.GOOGLE_CLIENT_SECRET,
      redirect_uri: environment.GOOGLE_REDIRECT_URI,
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

async function refreshAccessToken(token: StoredGoogleToken) {
  if (!token.refreshToken) {
    return token.accessToken;
  }

  if (token.expiresAt && token.expiresAt > Date.now() + 60_000) {
    return token.accessToken;
  }

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
  tokenStore.token = {
    ...token,
    accessToken: payload.access_token,
    expiresAt: payload.expires_in
      ? Date.now() + payload.expires_in * 1000
      : token.expiresAt,
    scope: payload.scope ?? token.scope,
  };

  return tokenStore.token.accessToken;
}

export async function findGoogleCalendarSlots(
  token?: StoredGoogleToken | null,
  options?: CalendarSlotSearchOptions,
): Promise<GoogleCalendarSlot[] | null> {
  const availability = await findGoogleCalendarAvailability(token, options);

  return availability?.freeSlots ?? null;
}

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
  const timeMin = options?.dateRange?.from
    ? createDateInTimeZone(new Date(`${options.dateRange.from}T12:00:00Z`), 0, 0, timezone)
    : now;
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

      if (start <= timeMin || start >= timeMax) {
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
