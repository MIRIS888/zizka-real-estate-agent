export type AgentIntent =
  | "email_read"
  | "email_draft"
  | "email_send"
  | "calendar_read"
  | "calendar_write"
  | "internal_analytics"
  | "property_search"
  | "web_search"
  | "scheduled_task"
  | "report"
  | "confirmation_reply"
  | "general_chat";

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function any(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(norm(p)));
}

export function classifyIntent(
  userMessage: string,
  hasPendingConfirmation: boolean,
): AgentIntent {
  const m = norm(userMessage.trim());

  if (hasPendingConfirmation) {
    const confirm = ["ano", "jo", "ok", "posli", "odesli", "yes", "potvrdi", "souhlas", "zaloz", "uprav", "smaz"];
    const reject = ["ne ", "ne,", "nechci", "zrus", "cancel", "storno", "stop"];
    const isConfirm = confirm.some((w) => m === w || m.startsWith(w + " ") || m.includes(" " + w));
    const isReject = reject.some((w) => m.startsWith(w) || m.includes(" " + w.trim()));
    if (isConfirm || isReject) return "confirmation_reply";
  }

  if (any(m, ["posli email", "odešli email", "odešli mail", "posli mail", "posli to", "odesli to", "posli zpravu"])) {
    return "email_send";
  }
  if (any(m, ["napiš email", "priprav email", "napiš mail", "naformuluj", "udělej návrh mailu", "sestav email", "napiš zprávu zájemci", "napiš mu", "napiš ji"])) {
    return "email_draft";
  }
  if (any(m, ["přečti mail", "přečti poštu", "zkontroluj mail", "zkontroluj poštu", "nepřečtené", "inbox", "co mám v mailu", "shrnuj emaily", "shrni emaily", "nové emaily", "najdi email"])) {
    return "email_read";
  }

  if (any(m, ["přidej událost", "naplánuj schůzku", "vytvoř schůzku", "založ schůzku", "zapis do kalendáře", "vytvoř událost", "přesuň schůzku", "uprav schůzku", "uprav událost", "smaž schůzku", "smaž událost", "zruš schůzku"])) {
    return "calendar_write";
  }
  if (any(m, ["jaké mám schůzky", "co mám v kalendáři", "kdy mám volno", "volné termíny", "dostupnost", "jaký mám program", "termíny prohlídky"])) {
    return "calendar_read";
  }

  if (any(m, ["nové klienty", "přehled klientů", "kolik klientů", "klientská základna", "leady", "poptávky", "záznamy zájmu", "zájemci", "prodeje", "statistiky", "kvartál", "q1", "q2", "q3", "q4", "graficky", "graf vývoje", "počet leadů", "kolik jsme prodali", "kolik přišlo"])) {
    return "internal_analytics";
  }

  if (any(m, ["chybí data", "chybějí", "neúplné nemovitosti", "rekonstrukce", "stavební úpravy", "nemovitosti chybí"])) {
    return "property_search";
  }

  if (any(m, ["každé ráno", "každý den", "každý pracovní", "opakovaně mi posílej", "naplánuj monitoring", "sleduj každý", "v 8:00 mi", "v 9:00 mi", "ráno mi posílej", "denní přehled", "pravidelný přehled"])) {
    return "scheduled_task";
  }

  if (any(m, ["sreality", "bezrealitky", "realitní server", "prohledej web", "nabídky na internetu", "aktuální nabídky", "ověř nabídky", "nové nabídky", "najdi nabídky", "realitní portál"])) {
    return "web_search";
  }

  if (any(m, ["report", "shrnutí výsledků", "výsledky minulého", "výsledky tohoto", "prezentace", "slide", "slidy", "pptx", "powerpoint", "pro vedení", "pro management", "týdenní report", "ranní report"])) {
    return "report";
  }

  return "general_chat";
}

export function intentToRouteHint(intent: AgentIntent): string | null {
  switch (intent) {
    case "email_draft":
      return "ZÁMĚR: Uživatel chce NAPSAT (ne odeslat) e-mail. Zavolej POUZE create_email_draft. NEPOKRAČUJ na send_email.";
    case "email_send":
      return "ZÁMĚR: Uživatel chce ODESLAT e-mail. Workflow: create_email_draft → send_email. Server zachytí send_email.";
    case "email_read":
      return "ZÁMĚR: Přečíst/prohledat poštu. Použij list_recent_emails nebo search_emails.";
    case "calendar_read":
      return "ZÁMĚR: Zjistit dostupnost nebo přehled událostí. Použij find_calendar_slots nebo find_calendar_events.";
    case "calendar_write":
      return "ZÁMĚR: Přidat/upravit/smazat událost. Pro přidání: create_calendar_event. Pro úpravu: find_calendar_events → update_calendar_event. Pro smazání: find_calendar_events → delete_calendar_event.";
    case "internal_analytics":
      return "ZÁMĚR: Analytický dotaz. Klienti: query_client_metrics. Leady: query_lead_metrics. Prodeje: query_sales_metrics. Grafické výsledky vloží UI automaticky.";
    case "property_search":
      return "ZÁMĚR: Kvalita dat nemovitostí. Použij find_incomplete_properties.";
    case "web_search":
      return "ZÁMĚR: Realitní trh. Okamžité hledání: watch_market mode='preview'. Pravidelný monitoring: create_scheduled_task nebo watch_market mode='schedule'.";
    case "scheduled_task":
      return "ZÁMĚR: Nastavit opakovanou/naplánovanou úlohu. Použij create_scheduled_task. Server zachytí a zobrazí potvrzení.";
    case "report":
      return "ZÁMĚR: Vytvořit report nebo prezentaci. Pro PPTX ke stažení ('prezentace', 'slidy', 'PowerPoint', '3 slidy pro vedení'): create_presentation. Pro textový přehled týdne: create_weekly_report. Pro ranní report emailem: send_morning_report.";
    case "confirmation_reply":
    case "general_chat":
      return null;
  }
}
