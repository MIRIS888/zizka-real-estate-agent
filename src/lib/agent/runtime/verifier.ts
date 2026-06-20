import { validateFinalMessage } from "./guardrails";

const SAFE_FALLBACK =
  "Výsledek nelze zobrazit v čitelném formátu. Zkuste dotaz zformulovat jinak.";

export function verifyFinalMessage(rawMessage: string): string {
  const result = validateFinalMessage(rawMessage);
  if (!result.ok) return SAFE_FALLBACK;
  return rawMessage;
}
