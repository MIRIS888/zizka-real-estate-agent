function getPublishUrl(): string {
  const base = (process.env.QSTASH_URL ?? "https://qstash.upstash.io").replace(/\/$/, "");
  return `${base}/v2/publish`;
}

export type QStashResult = { messageId: string };

// Schedules a POST to `targetUrl` at `runAt` via Upstash QStash.
// CRON_SECRET is forwarded so the existing isCronAuthorized guard accepts it.
export async function scheduleQStashTrigger(
  runAt: Date,
  targetUrl: string,
  cronSecret: string,
  qstashToken: string,
): Promise<QStashResult | null> {
  const notBefore = Math.floor(runAt.getTime() / 1000);
  try {
    const response = await fetch(`${getPublishUrl()}/${encodeURIComponent(targetUrl)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${qstashToken}`,
        "Content-Type": "application/json",
        "Upstash-Not-Before": String(notBefore),
        "Upstash-Retries": "2",
        "Upstash-Forward-Authorization": `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ source: "qstash_one_time" }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { messageId?: string };
    return data.messageId ? { messageId: data.messageId } : null;
  } catch {
    return null;
  }
}

export function isQStashConfigured(): boolean {
  return !!(process.env.QSTASH_URL && process.env.QSTASH_TOKEN && process.env.APP_URL);
}

export function getRunDueTasksUrl(): string {
  const base = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return `${base}/api/cron/run-due-tasks`;
}
