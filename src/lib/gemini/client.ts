import { GoogleGenAI } from "@google/genai";

import { ChatResponseSchema, type ChatResponse } from "@/lib/contracts/chat";
import { AgentPlanSchema, type AgentPlan } from "@/lib/contracts/tools";
import { getGeminiEnvironment } from "@/lib/env";

const SYSTEM_INSTRUCTION = `
You are a Czech-speaking real estate back-office operations assistant.
Classify the user's intent and answer briefly in Czech.
Never claim that an external action or database query was completed unless a
tool result proves it. Any operation that sends a message, changes data, or
creates an external record requires explicit user confirmation.

Return only valid JSON with this shape:
{
  "message": "string",
  "intent": "analytics | data_quality | calendar | email | report | market_watch | general",
  "requiresConfirmation": boolean
}
`;

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
- create_email_draft: Use for drafting an email to an interested buyer and recommending a viewing slot. Input shape:
  {"recipientEmail":"optional@email.cz","propertyTitle":"string","tone":"formal|friendly"}
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
For requests to monitor real estate portals on a schedule, choose watch_market.
If the user does not provide a date range for lead analytics, use the last 6 full months relative to 2026-06-15.

Return this JSON shape:
{
  "message": "short Czech message",
  "intent": "analytics | data_quality | calendar | email | report | market_watch | general",
  "toolName": "none | query_lead_metrics | query_sales_metrics | find_incomplete_properties | find_calendar_slots | create_email_draft | create_weekly_report | watch_market",
  "toolInput": {},
  "requiresConfirmation": boolean
}
`;

function extractJson(text: string): unknown {
  const normalizedText = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(normalizedText);
}

export async function generateChatResponse(
  userMessage: string,
): Promise<ChatResponse> {
  const environment = getGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });

  const response = await client.models.generateContent({
    model: environment.GEMINI_MODEL,
    contents: userMessage,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  return ChatResponseSchema.parse(extractJson(response.text));
}

export async function generateAgentPlan(userMessage: string): Promise<AgentPlan> {
  const environment = getGeminiEnvironment();
  const client = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });

  const response = await client.models.generateContent({
    model: environment.GEMINI_MODEL,
    contents: userMessage,
    config: {
      systemInstruction: PLANNER_INSTRUCTION,
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  return AgentPlanSchema.parse(extractJson(response.text));
}
