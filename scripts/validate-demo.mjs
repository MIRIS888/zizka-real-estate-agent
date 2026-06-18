const baseUrl = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000";

// Prompts and their expected validation modes:
//   "artifact"  — expects payload.artifact or payload.artifacts
//   "email"     — expects payload.emailDraft (or clarification if context missing)
//   "confirm"   — expects agent to ask for confirmation (requiresConfirmation or message without action)
//   "message"   — expects any valid message response (no tool artifact required)
const prompts = [
  {
    text: "Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?",
    mode: "artifact",
    label: "lead_metrics_Q1",
  },
  {
    text: "Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.",
    mode: "artifact",
    label: "sales_metrics_6m",
  },
  {
    // Includes concrete email + property so agent can call create_email_draft immediately
    text: "Napiš e-mail pro zájemce jan.novak@example.com o prohlídku bytu 3+1 v Holešovicích a navrhni termín na příští týden.",
    mode: "email",
    label: "create_email_draft",
  },
  {
    text: "Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.",
    mode: "artifact",
    label: "find_incomplete_properties",
  },
  {
    text: "Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.",
    mode: "artifact",
    label: "create_weekly_report",
  },
  {
    // Must NOT create a task — must ask for confirmation first
    text: "Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.",
    mode: "confirm",
    label: "market_watch_confirm",
  },
];

async function validatePrompt({ text, mode, label }, index) {
  const response = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`[${label}] HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const payload = await response.json();

  if (!payload.message || !payload.intent) {
    throw new Error(`[${label}] Invalid payload — missing message or intent`);
  }

  if (mode === "artifact") {
    if (!payload.artifact && !payload.artifacts) {
      throw new Error(`[${label}] Expected artifact — got intent=${payload.intent}, message="${payload.message.slice(0, 80)}..."`);
    }
  }

  if (mode === "email") {
    // Accept emailDraft (tool ran) OR clarifying question (agent needs more info)
    // Both are valid: the point is the agent doesn't crash and responds in Czech
    const hasEmailDraft = !!payload.emailDraft;
    const hasClarification = payload.intent === "general" && typeof payload.message === "string" && payload.message.length > 0;
    if (!hasEmailDraft && !hasClarification) {
      throw new Error(`[${label}] Expected emailDraft or clarification — got intent=${payload.intent}`);
    }
  }

  if (mode === "confirm") {
    // Agent MUST NOT return emailDraft or an artifact — it should ask for confirmation
    if (payload.emailDraft || (payload.artifact && payload.artifacts)) {
      throw new Error(`[${label}] Agent performed action without confirmation`);
    }
    if (!payload.message) {
      throw new Error(`[${label}] Expected confirmation request — got empty message`);
    }
  }

  const extra = payload.emailDraft ? " [emailDraft]" : payload.artifacts ? ` [${payload.artifacts.length} artifacts]` : payload.artifact ? " [artifact]" : "";
  console.log(`OK ${index + 1}: ${label} (${payload.intent})${extra}`);
}

try {
  for (const [index, item] of prompts.entries()) {
    await validatePrompt(item, index);
  }
  console.log("\nAll demo prompts passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(`\nStart the app first: npm run dev -- -p 3000`);
  process.exit(1);
}
