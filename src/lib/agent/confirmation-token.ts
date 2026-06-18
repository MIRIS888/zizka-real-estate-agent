import { createHmac } from "crypto";

const ALGORITHM = "sha256";
const TTL_MS = 10 * 60 * 1000; // 10 minutes

export type PendingTool = {
  toolName: string;
  payload: Record<string, unknown>;
};

type TokenPayload = {
  userId: string;
  toolName: string;
  payloadHash: string;
  exp: number;
};

function getHmacSecret(): string | null {
  return process.env.HMAC_SECRET ?? process.env.CRON_SECRET ?? null;
}

// Canonical JSON serialization that sorts object keys at every level
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`);
  return `{${pairs.join(",")}}`;
}

function hashPayload(secret: string, payload: Record<string, unknown>): string {
  return createHmac(ALGORITHM, secret).update(stableStringify(payload)).digest("hex");
}

export function generateConfirmationToken(
  userId: string,
  pending: PendingTool,
): string | null {
  const secret = getHmacSecret();
  if (!secret) return null;

  const exp = Date.now() + TTL_MS;
  const data: TokenPayload = {
    userId,
    toolName: pending.toolName,
    payloadHash: hashPayload(secret, pending.payload),
    exp,
  };
  const dataStr = JSON.stringify(data);
  const sig = createHmac(ALGORITHM, secret).update(dataStr).digest("hex");
  return Buffer.from(JSON.stringify({ d: dataStr, s: sig })).toString("base64url");
}

export function verifyConfirmationToken(
  token: string | undefined | null,
  userId: string | undefined | null,
  pending: PendingTool,
): boolean {
  if (!token || !userId) return false;
  const secret = getHmacSecret();
  if (!secret) return false;

  try {
    const outer = JSON.parse(Buffer.from(token, "base64url").toString("utf-8")) as {
      d: string;
      s: string;
    };
    const expectedSig = createHmac(ALGORITHM, secret).update(outer.d).digest("hex");
    if (expectedSig !== outer.s) return false;

    const data = JSON.parse(outer.d) as TokenPayload;
    if (data.exp < Date.now()) return false;
    if (data.userId !== userId) return false;
    if (data.toolName !== pending.toolName) return false;

    const expectedHash = hashPayload(secret, pending.payload);
    return data.payloadHash === expectedHash;
  } catch {
    return false;
  }
}
