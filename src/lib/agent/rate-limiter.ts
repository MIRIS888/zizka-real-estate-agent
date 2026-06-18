type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

// In-memory store per serverless instance. Does not persist across cold starts
// or across Vercel instances — acceptable for demo/MVP. Swap for Upstash Redis
// in production for cross-instance enforcement.
const store = new Map<string, RateLimitEntry>();

function evictExpired(now: number) {
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

export function checkRateLimit(key: string): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  evictExpired(now);

  const entry = store.get(key);

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, resetAt: now + WINDOW_MS };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, resetAt: entry.resetAt };
  }

  store.set(key, { ...entry, count: entry.count + 1 });
  return { allowed: true, resetAt: entry.resetAt };
}

export function getRateLimitKey(request: Request, userId?: string): string {
  if (userId) return `user:${userId}`;
  const xff = request.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",")[0].trim() : "unknown";
  return `ip:${ip}`;
}
