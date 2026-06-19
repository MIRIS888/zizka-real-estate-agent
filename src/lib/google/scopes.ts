// Single source of truth for all Google OAuth scopes.
// All OAuth flows (login, standalone connect, callback) must import from here.
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
] as const;

export const GOOGLE_OAUTH_SCOPES_STRING = GOOGLE_OAUTH_SCOPES.join(" ");

export const SCOPE_GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
export const SCOPE_GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";
export const SCOPE_CALENDAR_EVENTS = "https://www.googleapis.com/auth/calendar.events";
export const SCOPE_CALENDAR_READ = "https://www.googleapis.com/auth/calendar.readonly";

export function hasScope(tokenScope: string | undefined, scope: string): boolean {
  return (tokenScope ?? "").split(" ").includes(scope);
}
