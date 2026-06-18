export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    // CRON_SECRET is set — require matching Bearer token
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }

  // In production, CRON_SECRET must always be configured
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  // Local dev fallback only: accept Vercel infrastructure header
  return request.headers.get("x-vercel-cron") === "1";
}
