/**
 * Agent Runtime v2 — deterministic eval suite
 * Usage: npm run eval:agent
 *
 * Tests intent classification, capability resolution, and guardrails.
 * No live Gemini calls — safe to run in CI.
 */

// ─── Inline ports of runtime modules (no transpile needed) ───────────────────

function norm(s) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function anyMatch(text, patterns) {
  return patterns.some((p) => text.includes(norm(p)));
}

function classifyIntent(userMessage, hasPendingConfirmation) {
  const m = norm(userMessage.trim());

  if (hasPendingConfirmation) {
    const confirm = ["ano", "jo", "ok", "posli", "odesli", "yes", "potvrdi", "souhlas", "zaloz", "uprav", "smaz"];
    const reject = ["ne ", "ne,", "nechci", "zrus", "cancel", "storno", "stop"];
    const isConfirm = confirm.some((w) => m === w || m.startsWith(w + " ") || m.includes(" " + w));
    const isReject = reject.some((w) => m.startsWith(w) || m.includes(" " + w.trim()));
    if (isConfirm || isReject) return "confirmation_reply";
  }

  if (anyMatch(m, ["posli email", "odešli email", "odešli mail", "posli mail", "posli to", "odesli to"])) return "email_send";
  if (anyMatch(m, ["napiš email", "připrav email", "napiš mail", "naformuluj", "udělej návrh mailu", "sestav email"])) return "email_draft";
  if (anyMatch(m, ["přečti mail", "zkontroluj mail", "zkontroluj poštu", "nepřečtené", "inbox", "co mám v mailu"])) return "email_read";
  if (anyMatch(m, ["přidej událost", "naplánuj schůzku", "vytvoř schůzku", "založ schůzku", "přesuň schůzku", "smaž schůzku", "smaž událost"])) return "calendar_write";
  if (anyMatch(m, ["jaké mám schůzky", "co mám v kalendáři", "kdy mám volno", "volné termíny", "termíny prohlídky"])) return "calendar_read";
  if (anyMatch(m, ["nové klienty", "leady", "poptávky", "prodeje", "statistiky", "kvartál", "q1", "graficky", "graf vývoje", "kolik jsme prodali", "kolik přišlo"])) return "internal_analytics";
  if (anyMatch(m, ["chybí data", "neúplné nemovitosti", "rekonstrukce", "stavební úpravy"])) return "property_search";
  if (anyMatch(m, ["každé ráno", "každý den", "denní přehled", "pravidelný přehled", "opakovaně mi posílej"])) return "scheduled_task";
  if (anyMatch(m, ["sreality", "bezrealitky", "realitní server", "aktuální nabídky", "nové nabídky", "realitní portál"])) return "web_search";
  if (anyMatch(m, ["report", "shrnutí výsledků", "výsledky minulého", "prezentace", "slide", "slidy", "pptx", "powerpoint", "pro vedení"])) return "report";
  return "general_chat";
}

function validateFinalMessage(message) {
  const JSON_START = /^\s*[\[{]/;
  const JSON_END = /[\]}]\s*$/;
  if (JSON_START.test(message) && JSON_END.test(message)) {
    try { JSON.parse(message.trim()); return { ok: false, reason: "raw JSON" }; } catch {}
  }
  const stackPatterns = ["at Object.", "at Module.", "TypeError:", "ReferenceError:", "Cannot read propert"];
  if (stackPatterns.some((p) => message.includes(p))) return { ok: false, reason: "stack trace" };
  return { ok: true };
}

function validateEmailContent(body, subject, constraints) {
  if (!constraints.noMeeting) return { ok: true };
  const MEETING_WORDS = ["schůzka", "schůzce", "schůzku", "setkání", "termín prohlídky", "telefonát", "meeting"];
  const combined = norm(body + " " + subject);
  const found = MEETING_WORDS.find((w) => combined.includes(norm(w)));
  if (found) return { ok: false, reason: `Meeting word found: ${found}` };
  return { ok: true };
}

function resolveCapabilities(googleToken) {
  const hasToken = !!(googleToken?.accessToken ?? googleToken?.refreshToken);
  const scope = googleToken?.scope ?? "";
  const hasScope = (s) => scope.split(" ").includes(s);
  return {
    gmailRead: hasToken && hasScope("https://www.googleapis.com/auth/gmail.readonly"),
    gmailSend: hasToken && hasScope("https://www.googleapis.com/auth/gmail.send"),
    calendarRead: hasToken && hasScope("https://www.googleapis.com/auth/calendar.readonly"),
    calendarWrite: hasToken && hasScope("https://www.googleapis.com/auth/calendar.events"),
    internalData: true,
    webSearch: !!process.env.FIRECRAWL_API_KEY,
    scheduler: true,
    qstashExactScheduling: !!(process.env.QSTASH_TOKEN && process.env.QSTASH_URL),
  };
}

// ─── Backend confirmation gate (inlined from run-agent.ts) ───────────────────

function normMsg(s) {
  return s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const STANDALONE_CONFIRM_PHRASES = new Set([
  "ano", "jo", "jj", "ok", "yes", "confirm",
  "potvrzuji", "potvrdit", "souhlas", "souhlasim",
  "posli", "odesli", "odeslat",
  "posli to", "odesli to", "posli email", "odesli email",
  "ano posli", "ano odesli", "ano, posli", "ano, odesli",
  "ok posli", "ok odesli", "ok, posli", "ok, odesli",
  "proved", "zaloz", "vytvor",
]);

function isStandaloneConfirm(message) {
  return STANDALONE_CONFIRM_PHRASES.has(normMsg(message));
}

function isValidRealEmail(to) {
  if (!to || !to.includes("@")) return false;
  const t = to.toLowerCase().trim();
  return (
    !t.endsWith("@example.com") &&
    !t.startsWith("zajemce@") &&
    !t.startsWith("klient@") &&
    !t.startsWith("test@") &&
    !t.startsWith("recipient@")
  );
}

// ─── Eval scenarios ───────────────────────────────────────────────────────────

const scenarios = [
  {
    id: "INTENT-01",
    desc: "'napiš email zájemci' → email_draft",
    fn: () => classifyIntent("Napiš email zájemci o bytě na Žižkově", false) === "email_draft",
  },
  {
    id: "INTENT-02",
    desc: "'pošli email' → email_send",
    fn: () => classifyIntent("Pošli email na info@example.com", false) === "email_send",
  },
  {
    id: "INTENT-03",
    desc: "'zkontroluj poštu' → email_read",
    fn: () => classifyIntent("Zkontroluj poštu, mám nějaké nové emaily?", false) === "email_read",
  },
  {
    id: "INTENT-04",
    desc: "'volné termíny' → calendar_read",
    fn: () => classifyIntent("Jaké mám volné termíny příští týden?", false) === "calendar_read",
  },
  {
    id: "INTENT-05",
    desc: "'vytvoř schůzku' → calendar_write",
    fn: () => classifyIntent("Vytvoř schůzku s panem Novákem na pondělí v 10:00", false) === "calendar_write",
  },
  {
    id: "INTENT-06",
    desc: "'kolik leadů Q1' → internal_analytics",
    fn: () => classifyIntent("Kolik přišlo leadů za Q1 a odkud?", false) === "internal_analytics",
  },
  {
    id: "INTENT-07",
    desc: "'chybí data rekonstrukce' → property_search",
    fn: () => classifyIntent("Najdi nemovitosti, u kterých chybí data o rekonstrukci a stavebních úpravách", false) === "property_search",
  },
  {
    id: "INTENT-08",
    desc: "'každé ráno monitoring' → scheduled_task",
    fn: () => classifyIntent("Sleduj každé ráno nové nabídky v Holešovicích a posílej mi je", false) === "scheduled_task",
  },
  {
    id: "INTENT-09",
    desc: "'sreality nabídky' → web_search",
    fn: () => classifyIntent("Jaké jsou aktuální nabídky na realitních portálech v Praze 7?", false) === "web_search",
  },
  {
    id: "INTENT-10",
    desc: "'ano pošli' s pending confirmation → confirmation_reply",
    fn: () => classifyIntent("ano pošli", true) === "confirmation_reply",
  },
  {
    id: "GUARD-11",
    desc: "raw JSON message → guardrail fails",
    fn: () => {
      const msg = '{"result": "ok", "data": [1, 2, 3]}';
      return validateFinalMessage(msg).ok === false;
    },
  },
  {
    id: "GUARD-12",
    desc: "email s 'schůzka' a noMeeting=true → guardrail fails",
    fn: () => {
      const body = "Navrhujeme schůzku v pondělí v 10 hodin.";
      return validateEmailContent(body, "Nabídka bytu", { noMeeting: true }).ok === false;
    },
  },
  {
    id: "CAP-13",
    desc: "no google token → gmailRead=false, calendarRead=false",
    fn: () => {
      const caps = resolveCapabilities(null);
      return caps.gmailRead === false && caps.calendarRead === false && caps.internalData === true;
    },
  },
  {
    id: "CAP-14",
    desc: "token with all scopes → all google caps true",
    fn: () => {
      const token = {
        accessToken: "tok",
        scope: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.send",
          "https://www.googleapis.com/auth/calendar.readonly",
          "https://www.googleapis.com/auth/calendar.events",
        ].join(" "),
      };
      const caps = resolveCapabilities(token);
      return caps.gmailRead && caps.gmailSend && caps.calendarRead && caps.calendarWrite;
    },
  },
  // ── Regression scenarios ─────────────────────────────────────────────────────
  {
    id: "REG-15",
    desc: "email s 'termín prohlídky' a noMeeting=true → guardrail fails (diacritics variant)",
    fn: () => {
      const body = "Rádi bychom Vám navrhli termín prohlídky na příští týden.";
      return validateEmailContent(body, "Nabídka bytu", { noMeeting: true }).ok === false;
    },
  },
  {
    id: "REG-16",
    desc: "email s 'setkání' a noMeeting=true → guardrail fails",
    fn: () => {
      const body = "Dovolujeme si Vás pozvat na osobní setkání v naší kanceláři.";
      return validateEmailContent(body, "Interní nabídka", { noMeeting: true }).ok === false;
    },
  },
  {
    id: "REG-17",
    desc: "'ano pošli' bez pending → NENÍ confirmation_reply",
    fn: () => classifyIntent("ano pošli", false) !== "confirmation_reply",
  },
  {
    id: "REG-18",
    desc: "'ano pošli' s pending → je confirmation_reply",
    fn: () => classifyIntent("ano pošli", true) === "confirmation_reply",
  },
  {
    id: "REG-19",
    desc: "stack trace v message → guardrail fails",
    fn: () => {
      const msg = "TypeError: Cannot read property 'map' of undefined\n  at Object.handler (run-agent.ts:45)";
      return validateFinalMessage(msg).ok === false;
    },
  },
  {
    id: "REG-20",
    desc: "normální text → guardrail passes",
    fn: () => {
      const msg = "Zde jsou výsledky za Q1: celkem 12 nových klientů, z toho 5 z Facebooku.";
      return validateFinalMessage(msg).ok === true;
    },
  },
  {
    id: "REG-21",
    desc: "'ne zruš' s pending → je confirmation_reply (reject path)",
    fn: () => classifyIntent("ne, zruš to", true) === "confirmation_reply",
  },
  {
    id: "REG-22",
    desc: "partial JSON (not valid) → guardrail passes (not raw JSON)",
    fn: () => {
      const msg = "{ toto není validní json ale začíná závorkou";
      return validateFinalMessage(msg).ok === true;
    },
  },
  // ── Backend confirmation gate scenarios ──────────────────────────────────────
  {
    id: "GATE-23",
    desc: "'ano pošli' bez pendingTool → blocked (standalone confirm gate)",
    fn: () => isStandaloneConfirm("ano pošli"),
  },
  {
    id: "GATE-24",
    desc: "'ano' bez pendingTool → blocked",
    fn: () => isStandaloneConfirm("ano"),
  },
  {
    id: "GATE-25",
    desc: "'potvrzuji' bez pendingTool → blocked",
    fn: () => isStandaloneConfirm("potvrzuji"),
  },
  {
    id: "GATE-26",
    desc: "'ok pošli' bez pendingTool → blocked",
    fn: () => isStandaloneConfirm("ok pošli"),
  },
  {
    id: "GATE-27",
    desc: "'odeslat' bez pendingTool → blocked",
    fn: () => isStandaloneConfirm("odeslat"),
  },
  {
    id: "GATE-28",
    desc: "'ok, napiš email na sara@example.com...' → NOT blocked (real instruction)",
    fn: () => !isStandaloneConfirm("ok, napiš email na sara@example.com o interních nemovitostech"),
  },
  {
    id: "GATE-29",
    desc: "'napiš email zájemci o bytě' → NOT blocked (real task)",
    fn: () => !isStandaloneConfirm("napiš email zájemci o bytě na Žižkově"),
  },
  {
    id: "GATE-30",
    desc: "'pošli ranní report' → NOT blocked (has context word 'ranní report')",
    fn: () => !isStandaloneConfirm("pošli ranní report na můj email"),
  },
  // ── Draft-aware confirmation gate ────────────────────────────────────────────
  {
    id: "DRAFT-31",
    desc: "zajemce@example.com → NOT valid real email (placeholder blocked)",
    fn: () => isValidRealEmail("zajemce@example.com") === false,
  },
  {
    id: "DRAFT-32",
    desc: "null → NOT valid real email",
    fn: () => isValidRealEmail(null) === false,
  },
  {
    id: "DRAFT-33",
    desc: "sara.knapik24@gmail.com → valid real email",
    fn: () => isValidRealEmail("sara.knapik24@gmail.com") === true,
  },
  {
    id: "DRAFT-34",
    desc: "klient@example.com → NOT valid real email",
    fn: () => isValidRealEmail("klient@example.com") === false,
  },
  {
    id: "DRAFT-35",
    desc: "'ok pošli' + draft bez recipienta → standalone confirm + no valid email",
    fn: () => {
      const isConfirm = isStandaloneConfirm("ok pošli");
      const hasDraft = true;
      const hasValidRecipient = isValidRealEmail(null);
      // should route to "ask for recipient"
      return isConfirm && hasDraft && !hasValidRecipient;
    },
  },
  {
    id: "DRAFT-36",
    desc: "'ok pošli' + draft s recipientem → standalone confirm + valid email → confirmation",
    fn: () => {
      const isConfirm = isStandaloneConfirm("ok pošli");
      const hasDraft = true;
      const hasValidRecipient = isValidRealEmail("sara.knapik24@gmail.com");
      // should route to send_email confirmation
      return isConfirm && hasDraft && hasValidRecipient;
    },
  },
  {
    id: "DRAFT-37",
    desc: "'ok pošli' + žádný draft → standalone confirm + no draft → no pending action",
    fn: () => {
      const isConfirm = isStandaloneConfirm("ok pošli");
      const hasDraft = false;
      return isConfirm && !hasDraft;
    },
  },
  {
    id: "DRAFT-38",
    desc: "test@example.com → NOT valid real email",
    fn: () => isValidRealEmail("test@example.com") === false,
  },
];

// ─── PRES scenarios ──────────────────────────────────────────────────────────
const PRES_SCENARIOS = [
  {
    id: "PRES-39",
    desc: "'vytvoř prezentaci pro vedení' → report intent",
    fn: () => classifyIntent("vytvoř prezentaci pro vedení", false) === "report",
  },
  {
    id: "PRES-40",
    desc: "'připrav slidy' → report intent",
    fn: () => classifyIntent("připrav slidy", false) === "report",
  },
  {
    id: "PRES-41",
    desc: "'udělej PPTX' → report intent",
    fn: () => classifyIntent("udělej PPTX", false) === "report",
  },
  {
    id: "PRES-42",
    desc: "'shrnutí výsledků minulého týdne do prezentace' → report intent",
    fn: () => classifyIntent("shrnutí výsledků minulého týdne do prezentace se třemi slidy", false) === "report",
  },
  {
    id: "PRES-43",
    desc: "'připrav prezentaci se třemi slidy pro vedení' → report intent",
    fn: () => classifyIntent("připrav prezentaci se třemi slidy pro vedení", false) === "report",
  },
  {
    id: "PRES-44",
    desc: "'napiš email' is NOT report intent",
    fn: () => classifyIntent("napiš email pro zájemce", false) !== "report",
  },
  {
    id: "PRES-45",
    desc: "'report pro vedení' → report intent",
    fn: () => classifyIntent("připrav report pro vedení", false) === "report",
  },
];
scenarios.push(...PRES_SCENARIOS);

// ─── Runner ───────────────────────────────────────────────────────────────────

console.log("\n=== AGENT RUNTIME v2 — EVAL SUITE ===\n");

let passed = 0;
let failed = 0;

for (const scenario of scenarios) {
  let result;
  try {
    result = scenario.fn();
  } catch (err) {
    result = false;
    console.error(`  ERROR in ${scenario.id}: ${err.message}`);
  }
  const icon = result ? "✅" : "❌";
  console.log(`${icon} [${scenario.id}] ${scenario.desc}`);
  if (result) passed++;
  else failed++;
}

const total = scenarios.length;
console.log(`\n─── Result: ${passed}/${total} passed ───`);

if (failed > 0) {
  console.log(`❌ ${failed} scénář(ů) selhalo.\n`);
  process.exit(1);
} else {
  console.log("✅ Všechny scénáře prošly.\n");
}
