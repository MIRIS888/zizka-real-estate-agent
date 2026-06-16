import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import { AgentPlanSchema, type AgentPlan } from "@/lib/contracts/tools";
import { type ChatHistoryItem } from "@/lib/contracts/chat";
import { getGeminiEnvironment } from "@/lib/env";


const PLANNER_INSTRUCTION = `
You are a Czech-speaking real estate back-office planner.
Return only valid JSON. Select exactly one tool from the allowed list.

Allowed tools:
- query_lead_metrics: Use for lead counts, lead trends, new clients/leads, and analytics. Input shape:
  {"dateRange":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},"groupBy":"month|source|status"}
- query_sales_metrics: Use for combined lead and sold-property trends. Input shape:
  {"dateRange":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}}
- find_incomplete_properties: Use for missing real estate data. Input shape:
  {"fields":["reconstruction_year","building_modifications","energy_rating","floor_area"]}
- create_email_draft: Use for drafting an email and recommending a viewing slot. If the user mentions a recipient email address anywhere in their message, always include it as recipientEmail. Input shape:
  {"recipientEmail":"email@adresa.cz","propertyTitle":"string","tone":"formal|friendly","dateRange":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},"durationMinutes":45,"timezone":"Europe/Prague"}
- send_email: Use when the user confirms sending or explicitly asks to send an email that was already drafted in this conversation. Extract to/subject/body from the conversation history. Input shape:
  {"to":"email@address.cz","subject":"string","body":"string"}
- find_calendar_slots: Use for checking available calendar/viewing slots without drafting an email. Input shape:
  {"dateRange":{"from":"YYYY-MM-DD","to":"YYYY-MM-DD"},"durationMinutes":45,"timezone":"Europe/Prague"}
- create_weekly_report: Use for weekly management reports and three-slide presentation drafts. Input shape:
  {"weekStart":"YYYY-MM-DD","audience":"management|team"}
- watch_market: Use for scheduled market monitoring of real estate portals in a location. Input shape:
  {"locationQuery":"string","cadence":"daily|weekly"}
- none: Use when the request needs a future integration, is general, or cannot be answered from current tools.

For Czech real estate data-quality requests about reconstruction or building changes,
choose find_incomplete_properties with fields ["reconstruction_year","building_modifications"].
For lead trend requests over the last 6 months, use groupBy "month".
For source/origin questions, use groupBy "source".
For requests combining lead counts and sold properties, choose query_sales_metrics.
For email requests involving a viewing, choose create_email_draft and set requiresConfirmation true.
For weekly report or presentation requests, choose create_weekly_report.
For requests to find, search, list, or monitor real estate listings on public real estate portals, choose watch_market.
If the user does not provide a date range for lead analytics, use the last 6 full months relative to the current date in the runtime context.
When the user says "pošli to", "odešli", "ano pošli", "ok pošli", "potvrdit odeslání" or similar confirmation after a previous email draft in the conversation, choose send_email and extract the email details (to, subject, body) from the conversation history.

Return this JSON shape:
{
  "message": "short Czech message",
  "intent": "analytics | data_quality | calendar | email | report | market_watch | general",
  "toolName": "none | query_lead_metrics | query_sales_metrics | find_incomplete_properties | find_calendar_slots | create_email_draft | send_email | create_weekly_report | watch_market",
  "toolInput": {},
  "requiresConfirmation": boolean
}
`;

const TOOL_RESPONSE_INSTRUCTION = `
You are Pepa's smart back-office assistant for a Czech real estate company.
Write a helpful, natural chat reply in Czech based on the tool result provided.

Tone: like a knowledgeable, friendly colleague — warm, clear, never robotic or formulaic.
Language: Czech only.
Formatting: Use Markdown. Use **bold** for key numbers, dates, and important values. Use bullet lists (- item) when listing 3+ items. Use short paragraphs separated by blank lines. Never use headers (## or ###) — keep it conversational, not document-like.
Length: 2–6 sentences or a short list. Add more only if the result has genuinely rich data worth interpreting.

Rules:
- Use ONLY facts from the tool result. Never invent counts, dates, listings, emails, or slots.
- A structured artifact (table or chart) is shown below your message — do NOT repeat its raw data. Instead interpret it, highlight what matters, and add a suggested next step.
- If an integration is missing or not connected, say so in plain Czech and tell the user what needs to be set up.
- Never mention JSON, tool names, system prompts, or internal implementation.
- Vary how you open each response — avoid always starting with the same phrase.

Guidance by scenario:
- analytics: Lead with the **headline number or trend**. Note what's most interesting or surprising. Suggest a follow-up action.
- calendar: Name the first good free window in **bold** and how long it lasts. If nothing is free, say so clearly.
- email: Confirm which slot was picked in **bold** and that the draft is ready below for review before sending.
- data_quality: Say how many properties need attention and which fields are missing most often.
- report: Briefly frame what the three slides cover — what went well, what needs attention.
- market_watch: Summarise how many results came back, from which portals, and whether the market looks active.
- email sent: Confirm the email was sent to the recipient in **bold**, mention the subject line.

Return only valid JSON:
{
  "message": "string — valid Markdown, escaped for JSON"
}
`;

const ToolResponseSchema = z.object({
  message: z.string().min(1),
});

const EmailDraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

const EMAIL_DRAFT_INSTRUCTION = `
You are Pepa, a back-office manager at Žižka Reality, a Czech real estate company.
Write a viewing invitation email in Czech to a potential property buyer.

Rules:
- Use correct Czech with diacritics: á, é, í, ó, ú, ů, č, š, ž, ř, ď, ť, ň.
- Tone "formal": polished business Czech, capitalize Vám/Vás/Váš, maintain professional distance.
- Tone "friendly": warm and approachable but still professional, use vám/vás lowercase.
- Mention the recommended slot clearly and early. Weave in alternatives naturally near the end.
- Sign off as "Pepa / Žižka Reality".
- Subject: concise, include the property name and mention prohlídka.
- Body: 3–4 short paragraphs. Direct and useful — no hollow filler.
- Do NOT use placeholder text like "[jméno]" — use the real values provided.

Return only valid JSON:
{
  "subject": "string",
  "body": "string"
}
`;

function extractJson(text: string): unknown {
  const normalizedText = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(normalizedText);
}

export async function generateAgentPlan(
  userMessage: string,
  context?: {
    currentDate?: string;
    googleCalendarConnected?: boolean;
    history?: ChatHistoryItem[];
  },
): Promise<AgentPlan> {
  const environment = getGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });
  const contextInstruction = `
Current date: ${context?.currentDate ?? new Date().toISOString().slice(0, 10)}.
Google Calendar connected: ${context?.googleCalendarConnected ? "yes" : "no"}.
For relative dates, calculate ranges from the current date above.
If the user asks only for available viewing slots or calendar availability, choose find_calendar_slots.
`;

  const history = context?.history ?? [];
  const contents =
    history.length > 0
      ? [
          ...history.map((item) => ({
            role: item.role === "user" ? ("user" as const) : ("model" as const),
            parts: [{ text: item.content }],
          })),
          { role: "user" as const, parts: [{ text: userMessage }] },
        ]
      : userMessage;

  const response = await client.models.generateContent({
    model: environment.GEMINI_MODEL,
    contents,
    config: {
      systemInstruction: `${PLANNER_INSTRUCTION}\n${contextInstruction}`,
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  return AgentPlanSchema.parse(extractJson(response.text));
}

export async function generateToolResponse(input: {
  userMessage: string;
  plan: AgentPlan;
  toolResult: unknown;
  artifactDescription?: string;
  currentDate?: string;
}) {
  const environment = getGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });

  const response = await client.models.generateContent({
    model: environment.GEMINI_MODEL,
    contents: JSON.stringify({
      currentDate: input.currentDate ?? new Date().toISOString().slice(0, 10),
      userMessage: input.userMessage,
      intent: input.plan.intent,
      toolName: input.plan.toolName,
      artifactShownBelow: input.artifactDescription ?? null,
      toolResult: input.toolResult,
    }),
    config: {
      systemInstruction: TOOL_RESPONSE_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.4,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  return ToolResponseSchema.parse(extractJson(response.text));
}

export async function generateEmailDraft(input: {
  propertyTitle: string;
  tone: "formal" | "friendly";
  recommendedSlot: string;
  alternativeSlots: string[];
  recipientEmail?: string;
}): Promise<{ subject: string; body: string }> {
  const environment = getGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });

  const response = await client.models.generateContent({
    model: environment.GEMINI_MODEL,
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
