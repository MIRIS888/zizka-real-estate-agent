import { type ChatResponse } from "@/lib/contracts/chat";
import {
  localCalendarSlots,
  localClients,
  localDeals,
  localLeads,
  localMarketListings,
  localProperties,
  localTasks,
  localViewings,
} from "@/lib/local-data/seed";

type Artifact = NonNullable<ChatResponse["artifact"]>;
type GeneratedOutput = NonNullable<ChatResponse["generatedOutputs"]>[number];

const LOCAL_SOURCE = {
  label: "Lokalni demo dataset",
  detail:
    "Odpoved je vypoctena z deterministickych seed dat v src/lib/local-data/seed.ts. Nejde o nahodna ani halucinovana data.",
  mode: "local_demo" as const,
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("cs-CZ");
}

function isWithin(value: string, from: string, to: string) {
  const date = new Date(value);
  return date >= new Date(`${from}T00:00:00.000Z`) && date <= new Date(`${to}T23:59:59.999Z`);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function countBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [...grouped.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function toCsv(columns: string[], rows: Record<string, string | number>[]) {
  const escapeCell = (value: string | number) => {
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [columns.join(","), ...rows.map((row) => columns.map((column) => escapeCell(row[column] ?? "")).join(","))].join("\n");
}

function outputFromTable(artifact: Artifact): GeneratedOutput | null {
  if (artifact.type !== "table") return null;

  return {
    type: "csv",
    title: `${artifact.title} CSV`,
    filename: `${normalize(artifact.title).replaceAll(/\s+/g, "-")}.csv`,
    content: toCsv(artifact.columns, artifact.rows),
    mimeType: "text/csv;charset=utf-8",
  };
}

function createResponse(
  response: Omit<ChatResponse, "requiresConfirmation"> & {
    requiresConfirmation?: boolean;
  },
): ChatResponse {
  const artifacts = response.artifacts ?? (response.artifact ? [response.artifact] : undefined);
  return {
    ...response,
    artifacts,
    artifact: response.artifact ?? artifacts?.[0],
    requiresConfirmation: response.requiresConfirmation ?? false,
  };
}

function q1ClientsBySource(): ChatResponse {
  const clients = localClients.filter((client) => isWithin(client.createdAt, "2026-01-01", "2026-03-31"));
  const clientRows = clients.map((client) => ({
    id: client.id,
    name: client.name,
    created_at: client.createdAt.slice(0, 10),
    source: client.source,
    status: client.status,
    assigned_to: client.assignedTo,
  }));
  const sourceRows = countBy(clients, (client) => client.source).map((row) => ({
    source: row.label,
    clients: row.count,
  }));
  const clientTable: Artifact = {
    type: "table",
    title: "Novi klienti za 1. kvartal 2026",
    columns: ["id", "name", "created_at", "source", "status", "assigned_to"],
    rows: clientRows,
  };
  const sourceTable: Artifact = {
    type: "table",
    title: "Rozdeleni klientu podle zdroje",
    columns: ["source", "clients"],
    rows: sourceRows,
  };
  const sourceChart: Artifact = {
    type: "chart",
    title: "Klienti za Q1 podle zdroje",
    xKey: "source",
    yKey: "clients",
    data: sourceRows,
  };
  const strongestSource = [...sourceRows].sort(
    (left, right) => right.clients - left.clients || left.source.localeCompare(right.source),
  )[0];

  return createResponse({
    intent: "analytics",
    source: LOCAL_SOURCE,
    message: [
      `Za 1. kvartal 2026 evidujeme ${clients.length} novych klientu.`,
      `Nejsilnejsi zdroj je ${strongestSource?.source ?? "neznamy"} (${strongestSource?.clients ?? 0}).`,
      "Tabulka nize ukazuje jednotlive klienty a graf pouziva stejna data jako souhrn podle zdroje.",
    ].join("\n\n"),
    artifacts: [clientTable, sourceTable, sourceChart],
    generatedOutputs: [clientTable, sourceTable].map(outputFromTable).filter((output): output is GeneratedOutput => Boolean(output)),
  });
}

function q2MonthlyPerformance(): ChatResponse {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const rows = months.map((month) => ({
    month,
    leads: localLeads.filter((lead) => monthKey(lead.createdAt) === month).length,
    soldProperties: localDeals.filter((deal) => monthKey(deal.closedAt) === month && deal.status === "closed").length,
  }));
  const table: Artifact = {
    type: "table",
    title: "Mesicni vyvoj leadu a prodanych nemovitosti",
    columns: ["month", "leads", "soldProperties"],
    rows,
  };
  const leadChart: Artifact = {
    type: "chart",
    title: "Vyvoj poctu leadu",
    xKey: "month",
    yKey: "leads",
    data: rows,
  };
  const salesChart: Artifact = {
    type: "chart",
    title: "Vyvoj prodanych nemovitosti",
    xKey: "month",
    yKey: "soldProperties",
    data: rows,
  };
  const combinedChart: Artifact = {
    type: "chart",
    title: "Leady vs. prodane nemovitosti",
    xKey: "month",
    yKeys: ["leads", "soldProperties"],
    data: rows,
  };

  return createResponse({
    intent: "analytics",
    source: LOCAL_SOURCE,
    message:
      "Za poslednich 6 mesicu je v datech 10 leadu a 4 prodane nemovitosti. Leady rostou zejmena v cervnu, zatimco prodeje jsou rozlozene do ledna, brezna, dubna a cervna.",
    artifacts: [table, combinedChart, leadChart, salesChart],
    generatedOutputs: [outputFromTable(table)].filter((output): output is GeneratedOutput => Boolean(output)),
  });
}

function q3EmailDraft(): ChatResponse {
  const recommendedSlot = localCalendarSlots[0];
  const property = localProperties.find((item) => item.status === "active") ?? localProperties[0];
  const body = [
    "Dobry den,",
    "",
    `dekuji za Vas zajem o nemovitost ${property.title}. Podle aktualni dostupnosti navrhuji termin prohlidky ${recommendedSlot.label}.`,
    "",
    "Prosim o potvrzeni, zda Vam tento termin vyhovuje. Pokud ne, mohu nabidnout alternativne patek 19. 6. v 9:00 nebo pondeli 22. 6. v 10:30.",
    "",
    "S pozdravem",
    "Back Office Operations Agent",
  ].join("\n");
  const calendarTable: Artifact = {
    type: "table",
    title: "Mockovana dostupnost v kalendari",
    columns: ["label", "startsAt", "endsAt"],
    rows: localCalendarSlots.map((slot) => ({
      label: slot.label,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
    })),
  };

  return createResponse({
    intent: "email",
    source: {
      label: "Mock kalendar",
      detail:
        "Google Calendar neni pro demo vyzadovan. Termin je vybran z deterministicke mock dostupnosti.",
      mode: "local_demo",
    },
    message: `Doporuceny termin prohlidky je ${recommendedSlot.label}. Navrh e-mailu je pripraveny ke kopirovani.`,
    emailDraft: {
      to: "zajemce@example.com",
      subject: `Prohlidka nemovitosti: ${property.title}`,
      body,
    },
    artifacts: [calendarTable],
    generatedOutputs: [
      {
        type: "text",
        title: "E-mail draft",
        filename: "email-draft.txt",
        content: body,
        mimeType: "text/plain;charset=utf-8",
      },
    ],
  });
}

function q4IncompleteProperties(): ChatResponse {
  const rows = localProperties
    .map((property) => {
      const missingFields = [
        property.reconstructionInfo ? null : "reconstruction_info",
        property.constructionModifications ? null : "construction_modifications",
      ].filter((field): field is string => Boolean(field));
      return {
        id: property.id,
        title: property.title,
        address: `${property.address}, ${property.city}`,
        missingFields: missingFields.join(", "),
        priority: missingFields.length === 2 ? "vysoka" : missingFields.length === 1 ? "stredni" : "ok",
        nextStep: missingFields.length > 0 ? "Doplnit technicke udaje od vlastnika nebo z dokumentace." : "Bez akce",
      };
    })
    .filter((row) => row.missingFields);
  const table: Artifact = {
    type: "table",
    title: "Nemovitosti s chybejicimi udaji",
    columns: ["id", "title", "address", "missingFields", "priority", "nextStep"],
    rows,
  };

  return createResponse({
    intent: "data_quality",
    source: LOCAL_SOURCE,
    message:
      `Nasel jsem ${rows.length} nemovitosti, u kterych chybi udaje o rekonstrukci nebo stavebnich upravach. Priorita je odvozena z poctu chybejicich poli.`,
    artifacts: [table],
    generatedOutputs: [outputFromTable(table)].filter((output): output is GeneratedOutput => Boolean(output)),
  });
}

function q5WeeklyReport(): ChatResponse {
  const from = "2026-06-10";
  const to = "2026-06-17";
  const leads = localLeads.filter((lead) => isWithin(lead.createdAt, from, to));
  const deals = localDeals.filter((deal) => isWithin(deal.closedAt, from, to));
  const viewings = localViewings.filter((viewing) => isWithin(viewing.scheduledAt, from, to));
  const incompleteCount = localProperties.filter((property) => !property.reconstructionInfo || !property.constructionModifications).length;
  const report = [
    "# Tydenni report pro vedeni",
    "",
    `Obdobi: ${from} az ${to}`,
    "",
    `- Nove leady: ${leads.length}`,
    `- Naplanovane/probehle prohlidky: ${viewings.length}`,
    `- Uzavrene prodeje: ${deals.length}`,
    `- Nemovitosti s chybejicimi technickymi daty: ${incompleteCount}`,
    "",
    "Doporuceni: doplnit technicka data u aktivnich nemovitosti, rychle zpracovat cervnove leady a potvrdit dalsi prohlidky v Holesovicich.",
  ].join("\n");
  const metricsTable: Artifact = {
    type: "table",
    title: "Tydenni KPI",
    columns: ["metric", "value"],
    rows: [
      { metric: "Nove leady", value: leads.length },
      { metric: "Prohlidky", value: viewings.length },
      { metric: "Uzavrene prodeje", value: deals.length },
      { metric: "Nemovitosti k doplneni", value: incompleteCount },
    ],
  };
  const slidesTable: Artifact = {
    type: "table",
    title: "Prezentace pro vedeni - 3 slidy",
    columns: ["slide", "title", "content"],
    rows: [
      {
        slide: 1,
        title: "Obchodni vykon",
        content: `${leads.length} nove leady, ${deals.length} uzavreny prodej, nejvice aktivit v Praze.`,
      },
      {
        slide: 2,
        title: "Operativni rizika",
        content: `${incompleteCount} nemovitosti maji chybejici technicka data pro rekonstrukce nebo upravy.`,
      },
      {
        slide: 3,
        title: "Dalsi kroky",
        content: "Doplnit data, potvrdit prohlidky a pripravit follow-up pro cervnove leady.",
      },
    ],
  };

  return createResponse({
    intent: "report",
    source: LOCAL_SOURCE,
    message: report,
    artifacts: [metricsTable, slidesTable],
    generatedOutputs: [
      {
        type: "markdown",
        title: "Markdown report",
        filename: "tydenni-report.md",
        content: report,
        mimeType: "text/markdown;charset=utf-8",
      },
      {
        type: "presentation",
        title: "Struktura 3 slidu",
        filename: "prezentace-3-slidy.md",
        content: slidesTable.rows.map((row) => `## Slide ${row.slide}: ${row.title}\n${row.content}`).join("\n\n"),
        mimeType: "text/markdown;charset=utf-8",
      },
    ],
  });
}

function q6MarketWatch(): ChatResponse {
  const task = {
    id: "task-monitoring-holesovice",
    title: "Monitoring realitnich serveru - Praha Holesovice",
    description:
      "Kazde rano zkontrolovat hlavni realitni servery a poslat prehled novych nabidek v lokalite Praha Holesovice.",
    status: "scheduled",
    dueDate: "kazdy den 07:30 Europe/Prague",
    owner: "Back Office Agent",
  };
  const listings = localMarketListings.filter((listing) => normalize(listing.location).includes("praha holesovice"));
  const taskTable: Artifact = {
    type: "table",
    title: "Vytvoreny monitoring task",
    columns: ["id", "title", "description", "status", "dueDate", "owner"],
    rows: [task],
  };
  const listingsTable: Artifact = {
    type: "table",
    title: "Mockovane aktualni nabidky",
    columns: ["title", "location", "price", "source", "url"],
    rows: listings.map((listing) => ({
      title: listing.title,
      location: listing.location,
      price: listing.price,
      source: listing.source,
      url: listing.url,
    })),
  };

  return createResponse({
    intent: "market_watch",
    source: {
      label: "Mock monitoring",
      detail:
        "V demo rezimu je ulozeni tasku a seznam nabidek mockovany. Produkcne lze stejnou akci napojit na n8n cron a Firecrawl Search.",
      mode: "local_demo",
    },
    message:
      `Vytvoril jsem monitoring task pro lokalitu Praha Holesovice s periodicitou kazde rano v 07:30. Soucasne prikladam ${listings.length} mockovane aktualni nabidky.`,
    artifacts: [taskTable, listingsTable],
    generatedOutputs: [outputFromTable(listingsTable)].filter((output): output is GeneratedOutput => Boolean(output)),
  });
}

export function runDeterministicAgent(userMessage: string): ChatResponse | null {
  const message = normalize(userMessage);

  if (message.includes("1. kvartal") || message.includes("prvni kvartal")) {
    return q1ClientsBySource();
  }

  if (message.includes("poslednich 6 mesicu") && message.includes("prodanych")) {
    return q2MonthlyPerformance();
  }

  if (message.includes("e-mail") || message.includes("email")) {
    return q3EmailDraft();
  }

  if (message.includes("chybi") || message.includes("chybejic")) {
    return q4IncompleteProperties();
  }

  if (message.includes("minuleho tydne") || message.includes("kratkeho reportu") || message.includes("tri slidy")) {
    return q5WeeklyReport();
  }

  if (message.includes("sleduj") || message.includes("monitoring") || message.includes("holesovice")) {
    return q6MarketWatch();
  }

  if (message.includes("seed") || message.includes("data")) {
    return createResponse({
      intent: "general",
      source: LOCAL_SOURCE,
      message:
        `Demo dataset obsahuje ${localClients.length} klientu, ${localLeads.length} leadu, ${localProperties.length} nemovitosti, ${localDeals.length} obchody a ${localTasks.length} ulohy.`,
    });
  }

  return null;
}
