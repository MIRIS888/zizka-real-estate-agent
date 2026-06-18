import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
} from "@google/genai";
import { z } from "zod";

import { getGeminiEnvironment } from "@/lib/env";

export const CONVERSATIONAL_SYSTEM_INSTRUCTION = `
Jsi back-office asistent pro českou realitní kancelář Žižka Reality.
Mluvíš přirozeně, jasně a věcně jako schopný kolega.

Když k odpovědi potřebuješ interní data, aktuální nabídky, kalendář, report nebo akci v systému, zavolej příslušnou funkci.
Když funkci nepotřebuješ, odpověz rovnou textem.

Pravidla chování:
- Nikdy si nevymýšlej čísla, klienty, nabídky, termíny ani stav integrací.
- Používej jen data vrácená funkcemi nebo informace přímo od uživatele.
- Pokud výsledek funkce obsahuje isMock=true, jasně řekni, že jde o ukázková/demo data.
- Pokud výsledek funkce obsahuje isMock=false, nikdy netvrď, že jde o ukázková/demo data.
- Pokud výsledek funkce obsahuje isEmpty=true, jasně řekni, že se nic nenašlo nebo že zdroj není napojený.
- Akce s následkem nikdy neprováděj bez potvrzení uživatele: send_email, send_morning_report, create_scheduled_task, delete_scheduled_task.
- Pokud uživatel chce něco odeslat nebo založit, nejdřív napiš, co přesně se chystáš udělat, a požádej o potvrzení.
- Když uživatel v dalším tahu potvrdí ("ano", "ano pošli", "potvrzuji", "souhlasím", "ano založ", "ano smaž"), můžeš provést dříve popsanou akci.
- Jednorázové vyhledání nabídek ("najdi", "vyhledej", "ukaž", "vypiš") používej jako watch_market s mode="preview"; to nesmí nic zakládat.
- Pokud uživatel chce OPAKOVANĚ dostávat přehledy ("sleduj každé ráno", "posílej mi každý den", "hlídej", "každé ráno mě informuj", "pravidelně mi posílej"), vždy použij create_scheduled_task — NIKDY watch_market mode="schedule".
- Pokud ve zprávě chybí čas, použij výchozí "08:00". Pokud chybí lokalita, NEVOLEJ funkci — doptej se.
- create_scheduled_task vždy vyžaduje potvrzení. Po potvrzení úloha zůstane uložena v databázi a spouští se automaticky. Uživatel ji může spravovat na stránce Naplánované úlohy.
- Pro "jaké mám naplánované úlohy", "co mi chodí automaticky" použij list_scheduled_tasks.
- Při mazání úlohy nejdřív zavolej list_scheduled_tasks k ověření, pak delete_scheduled_task — ale vyžaduje potvrzení.
- Piš česky.
- Nepoužívej markdown headery.
- Klíčová čísla, data a termíny zvýrazni tučně.
- Pokud se zobrazuje tabulka nebo graf, neopisuj všechny řádky; shrň pointu a další krok.
`;

export const BUSINESS_FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "query_lead_metrics",
    description:
      "Získá počty leadů nebo klientských poptávek podle období a seskupení. Použij pro dotazy na počet leadů, nové klienty, zdroje leadů, statusy leadů a trend leadů. Pro otázky 'odkud přišli' použij groupBy='source'. Pro vývoj za měsíce použij groupBy='month'.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dateRange: {
          type: Type.OBJECT,
          description: "Období dotazu.",
          properties: {
            from: { type: Type.STRING, description: "Datum od ve formátu YYYY-MM-DD." },
            to: { type: Type.STRING, description: "Datum do ve formátu YYYY-MM-DD." },
          },
          required: ["from", "to"],
        },
        groupBy: {
          type: Type.STRING,
          enum: ["month", "source", "status"],
          description: "Dimenze seskupení výsledků.",
        },
      },
      required: ["dateRange", "groupBy"],
    },
  },
  {
    name: "query_sales_metrics",
    description:
      "Získá kombinovaný měsíční vývoj počtu leadů a prodaných nemovitostí. Použij pro dotazy typu 'graf vývoje leadů a prodaných nemovitostí' nebo porovnání obchodního výkonu v čase.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dateRange: {
          type: Type.OBJECT,
          description: "Období dotazu.",
          properties: {
            from: { type: Type.STRING, description: "Datum od ve formátu YYYY-MM-DD." },
            to: { type: Type.STRING, description: "Datum do ve formátu YYYY-MM-DD." },
          },
          required: ["from", "to"],
        },
      },
      required: ["dateRange"],
    },
  },
  {
    name: "find_incomplete_properties",
    description:
      "Najde nemovitosti s chybějícími údaji. Použij pro kontrolu kvality dat, hlavně když uživatel zmiňuje rekonstrukci, stavební úpravy, energetickou náročnost nebo podlahovou plochu.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        fields: {
          type: Type.ARRAY,
          description: "Pole, která se mají zkontrolovat.",
          items: {
            type: Type.STRING,
            enum: [
              "reconstruction_year",
              "building_modifications",
              "energy_rating",
              "floor_area",
            ],
          },
        },
      },
      required: ["fields"],
    },
  },
  {
    name: "find_calendar_slots",
    description:
      "Najde dostupné termíny v kalendáři bez psaní e-mailu. Použij pro dotazy na dostupnost nebo možné termíny prohlídky.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        dateRange: {
          type: Type.OBJECT,
          description: "Období hledání.",
          properties: {
            from: { type: Type.STRING, description: "Datum od ve formátu YYYY-MM-DD." },
            to: { type: Type.STRING, description: "Datum do ve formátu YYYY-MM-DD." },
          },
          required: ["from", "to"],
        },
        durationMinutes: {
          type: Type.INTEGER,
          description: "Délka prohlídky v minutách, typicky 45.",
        },
        timezone: {
          type: Type.STRING,
          description: "Časová zóna, typicky Europe/Prague.",
        },
      },
      required: ["dateRange", "durationMinutes", "timezone"],
    },
  },
  {
    name: "create_email_draft",
    description:
      "Vytvoří profesionální návrh e-mailu zájemci a doporučí termín prohlídky podle dostupnosti. Použij, když uživatel chce napsat e-mail k nemovitosti nebo prohlídce. Tato funkce e-mail neodesílá.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipientEmail: {
          type: Type.STRING,
          description: "E-mail příjemce, pokud ho uživatel uvedl.",
        },
        propertyTitle: {
          type: Type.STRING,
          description: "Název nebo popis nemovitosti.",
        },
        tone: {
          type: Type.STRING,
          enum: ["formal", "friendly"],
          description: "Tón e-mailu.",
        },
        dateRange: {
          type: Type.OBJECT,
          description: "Období pro hledání termínu.",
          properties: {
            from: { type: Type.STRING, description: "Datum od ve formátu YYYY-MM-DD." },
            to: { type: Type.STRING, description: "Datum do ve formátu YYYY-MM-DD." },
          },
          required: ["from", "to"],
        },
        durationMinutes: {
          type: Type.INTEGER,
          description: "Délka prohlídky v minutách, typicky 45.",
        },
        timezone: {
          type: Type.STRING,
          description: "Časová zóna, typicky Europe/Prague.",
        },
      },
    },
  },
  {
    name: "send_email",
    description:
      "Odešle e-mail přes Gmail. Použij pouze po explicitním potvrzení uživatele, například 'ano pošli'. Nikdy nepoužívej jako první krok bez předchozího návrhu nebo potvrzení.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        to: { type: Type.STRING, description: "E-mail příjemce." },
        subject: { type: Type.STRING, description: "Předmět e-mailu." },
        body: { type: Type.STRING, description: "Text e-mailu." },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "create_weekly_report",
    description:
      "Vytvoří krátký týdenní report a návrh tří slidů pro vedení nebo tým. Použij pro dotazy na shrnutí minulého týdne, report pro vedení nebo prezentaci.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        weekStart: {
          type: Type.STRING,
          description: "Začátek týdne ve formátu YYYY-MM-DD, pokud je známý.",
        },
        audience: {
          type: Type.STRING,
          enum: ["management", "team"],
          description: "Cílové publikum reportu.",
        },
      },
    },
  },
  {
    name: "send_morning_report",
    description:
      "Odešle ranní report e-mailem. Použij pouze po explicitním potvrzení uživatele. Pro samotné vytvoření přehledu bez odeslání nepoužívej.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        recipientEmail: {
          type: Type.STRING,
          description: "E-mail příjemce, pokud ho uživatel uvedl.",
        },
      },
    },
  },
  {
    name: "watch_market",
    description:
      "Vyhledá nebo nastaví sledování realitních nabídek. mode='preview' použij pro jednorázové najdi/vyhledej/ukaž/vypiš a nikdy nezakládá monitoring. mode='schedule' použij jen po potvrzení uživatele pro opakované sleduj/hlídej/posílej každé ráno.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mode: {
          type: Type.STRING,
          enum: ["preview", "schedule"],
          description: "preview = jen aktuální vyhledání; schedule = založení/aktualizace monitoringu po potvrzení.",
        },
        locationQuery: {
          type: Type.STRING,
          description: "Lokalita, například Praha Holešovice.",
        },
        cadence: {
          type: Type.STRING,
          enum: ["daily", "weekly"],
          description: "Periodicita monitoringu, pouze pro mode=schedule.",
        },
        scheduleDays: {
          type: Type.ARRAY,
          description: "ISO dny v týdnu 1=pondělí až 7=neděle, pouze pro mode=schedule.",
          items: { type: Type.INTEGER },
        },
        scheduleTime: {
          type: Type.STRING,
          description: "Čas ve formátu HH:mm, například 08:00, pouze pro mode=schedule.",
        },
        timezone: {
          type: Type.STRING,
          description: "Časová zóna, typicky Europe/Prague.",
        },
      },
      required: ["mode"],
    },
  },
  {
    name: "create_scheduled_task",
    description:
      "Vytvoří opakovanou naplánovanou úlohu uloženou v databázi. Použij POUZE když uživatel chce OPAKOVANĚ dostávat přehled v určitý čas ('posílej mi každý den v 8', 'každé ráno mi dej nabídky'). NE pro jednorázové vyhledání — to je watch_market mode='preview'. Pokud ve zprávě chybí čas nebo lokalita, NEVOLEJ tuto funkci — doptej se uživatele. Akce vyžaduje potvrzení před provedením.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        task_type: {
          type: Type.STRING,
          enum: ["market_digest"],
          description: "Typ úlohy. 'market_digest' = denní přehled nabídek z lokality zaslaný e-mailem.",
        },
        location: {
          type: Type.STRING,
          description: "Lokalita pro monitoring, např. 'Praha-Holešovice' nebo 'Praha 7'.",
        },
        schedule_time: {
          type: Type.STRING,
          description: "Čas odeslání ve formátu HH:MM, např. '08:00'.",
        },
        transaction: {
          type: Type.STRING,
          enum: ["sale", "rent"],
          description: "Typ transakce: 'sale' = prodej, 'rent' = pronájem. Výchozí 'sale'.",
        },
        frequency: {
          type: Type.STRING,
          enum: ["daily"],
          description: "Frekvence opakování. Výchozí 'daily'.",
        },
        timezone: {
          type: Type.STRING,
          description: "IANA časová zóna, výchozí 'Europe/Prague'.",
        },
      },
      required: ["task_type", "location", "schedule_time"],
    },
  },
  {
    name: "list_scheduled_tasks",
    description:
      "Zobrazí seznam aktivních naplánovaných úloh přihlášeného uživatele. Použij pro 'jaké mám naplánované úlohy', 'co mi chodí automaticky', 'co jsem si nastavil'. Před mazáním nebo úpravou úlohy vždy nejdřív zavolej tuto funkci k ověření ID.",
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },
  {
    name: "update_scheduled_task",
    description:
      "Aktualizuje parametry naplánované úlohy (čas, lokalitu, typ transakce). Nejdřív zavolej list_scheduled_tasks k získání správného ID.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: "UUID úlohy z výsledku list_scheduled_tasks.",
        },
        schedule_time: {
          type: Type.STRING,
          description: "Nový čas odeslání ve formátu HH:MM.",
        },
        location: {
          type: Type.STRING,
          description: "Nová lokalita.",
        },
        transaction: {
          type: Type.STRING,
          enum: ["sale", "rent"],
          description: "Nový typ transakce.",
        },
        timezone: {
          type: Type.STRING,
          description: "Nová IANA časová zóna.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_scheduled_task",
    description:
      "Smaže naplánovanou úlohu z databáze. Použij pro 'zruš', 'smaž', 'přestaň posílat'. Nejdřív zavolej list_scheduled_tasks k ověření ID. Akce vyžaduje potvrzení uživatele.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        id: {
          type: Type.STRING,
          description: "UUID úlohy z výsledku list_scheduled_tasks.",
        },
        description: {
          type: Type.STRING,
          description: "Stručný popis úlohy pro potvrzovací zprávu, např. 'denní přehled pro Praha-Holešovice v 08:00'.",
        },
      },
      required: ["id"],
    },
  },
];

const EmailDraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

const EMAIL_DRAFT_INSTRUCTION = `
You are writing a professional business email in Czech on behalf of Pepa from Žižka Reality.

FORMAT: Plain text only. No Markdown, no asterisks, no bullet points, no dashes, no special formatting of any kind.

LANGUAGE: Flawless Czech with all diacritics. Write the way a senior Czech real estate professional would actually write — fluent, natural, direct. Not translated from English, not bureaucratic, not stiff.

STYLE GUIDANCE:
- Formal tone (default): Use "Vám/Vás/Váš" capitalized. Open with "Dobrý den," and close warmly but professionally.
- Be direct — say what you mean without padding. Czech business writing values brevity.
- Sound like a real person, not a template. Vary your sentence structure.
- One idea per paragraph. Three paragraphs is usually enough.

WHAT TO AVOID — these phrases make emails sound machine-generated:
- "Rádi bychom Vás srdečně pozvali na..." → too ceremonial
- "Věříme, že Vám tento časový slot bude vyhovovat" → stiff, not natural Czech
- "Jako optimální termín bychom Vám rádi navrhli" → bureaucratic
- "V případě jakýchkoliv dotazů nás neváhejte kontaktovat" → hollow filler
- Any phrase that reads like it was translated word-for-word from English

WHAT TO AIM FOR:
- Open that gets straight to the point after the greeting
- Clear proposed time/topic stated naturally mid-sentence, not as a formal announcement
- One sentence acknowledging alternatives if any exist
- A brief, warm close that invites a reply
- Sign off: "S pozdravem,\nPepa / Žižka Reality"

SUBJECT: Short, specific, plain text. E.g. "Schůzka – středa 18. 6." or "Prohlídka bytu v Holešovicích – návrh termínu".

Return only valid JSON:
{
  "subject": "string",
  "body": "string — plain text, paragraphs separated by \\n\\n"
}
`;

function extractJson(text: string): unknown {
  const normalizedText = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(normalizedText);
}

export function createGeminiClient() {
  const environment = getGeminiEnvironment();

  return {
    client: new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY }),
    model: environment.GEMINI_MODEL,
  };
}

export function getFunctionCallingConfig() {
  return {
    tools: [{ functionDeclarations: BUSINESS_FUNCTION_DECLARATIONS }],
    toolConfig: {
      functionCallingConfig: {
        mode: FunctionCallingConfigMode.AUTO,
      },
    },
  };
}

export function getFunctionCalls(response: { functionCalls?: FunctionCall[] }) {
  return response.functionCalls ?? [];
}

export function createFunctionResponseContent(
  name: string,
  response: Record<string, unknown>,
  id?: string,
): Content {
  return {
    role: "user",
    parts: [
      {
        functionResponse: {
          name,
          id,
          response,
        },
      },
    ],
  };
}

export async function generateEmailDraft(input: {
  propertyTitle: string;
  tone: "formal" | "friendly";
  recommendedSlot: string;
  alternativeSlots: string[];
  recipientEmail?: string;
}): Promise<{ subject: string; body: string }> {
  const { client, model } = createGeminiClient();

  const response = await client.models.generateContent({
    model,
    contents: JSON.stringify(input),
    config: {
      systemInstruction: EMAIL_DRAFT_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.5,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty email draft.");
  }

  return EmailDraftSchema.parse(extractJson(response.text));
}
