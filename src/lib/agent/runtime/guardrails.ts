export type GuardrailResult =
  | { ok: true }
  | { ok: false; reason: string };

const MEETING_WORDS = [
  "schůzka",
  "schůzce",
  "schůzku",
  "setkání",
  "termín prohlídky",
  "termínu prohlídky",
  "telefonát",
  "telefonátu",
  "meeting",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function validateEmailContent(
  body: string,
  subject: string,
  constraints: { noMeeting?: boolean },
): GuardrailResult {
  if (!constraints.noMeeting) return { ok: true };

  const combined = norm(body + " " + subject);
  const found = MEETING_WORDS.find((w) => combined.includes(norm(w)));
  if (found) {
    return {
      ok: false,
      reason: `E-mail obsahuje zmínku o schůzce/termínu: "${found}". Přepiš e-mail bez zmínek o schůzkách.`,
    };
  }
  return { ok: true };
}

const STACK_TRACE_PATTERNS = [
  "at Object.",
  "at Module.",
  "at async ",
  "TypeError:",
  "ReferenceError:",
  "SyntaxError:",
  "Cannot read propert",
];

const JSON_START = /^\s*[\[{]/;
const JSON_END = /[\]}]\s*$/;

export function validateFinalMessage(message: string): GuardrailResult {
  if (JSON_START.test(message) && JSON_END.test(message)) {
    try {
      JSON.parse(message.trim());
      return {
        ok: false,
        reason: "Odpověď je raw JSON.",
      };
    } catch {
      // Not valid JSON — fine
    }
  }

  const hasStackTrace = STACK_TRACE_PATTERNS.some((p) => message.includes(p));
  if (hasStackTrace) {
    return {
      ok: false,
      reason: "Odpověď obsahuje stack trace nebo technickou chybu.",
    };
  }

  return { ok: true };
}
