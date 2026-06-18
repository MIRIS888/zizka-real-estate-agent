export function isCronAuthorized(request: Request): boolean {
  // Vercel Cron sends x-vercel-cron: 1 from their infrastructure (not forgeable externally)
  const isVercelCron = request.headers.get("x-vercel-cron") === "1";

  const secret = process.env.CRON_SECRET;
  if (secret) {
    // Prefer explicit bearer token when secret is configured
    return request.headers.get("authorization") === `Bearer ${secret}`;
  }

  // Fall back to Vercel-only header when no secret is set
  return isVercelCron;
}
