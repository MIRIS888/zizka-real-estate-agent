import { z } from "zod";

const ServerEnvironmentSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
});

const SupabaseServerEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEFAULT_ORGANIZATION_ID: z.uuid(),
});

const DataSourceEnvironmentSchema = z.object({
  DATA_SOURCE: z.enum(["local", "supabase"]).default("local"),
});

const N8nEnvironmentSchema = z.object({
  N8N_WEBHOOK_SECRET: z.string().min(24),
});

export function getGeminiEnvironment() {
  const parsedEnvironment = ServerEnvironmentSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  });

  if (!parsedEnvironment.success) {
    throw new Error(
      "Gemini is not configured. Add GEMINI_API_KEY to .env.local.",
    );
  }

  return parsedEnvironment.data;
}

export function getSupabaseServerEnvironment() {
  const parsedEnvironment = SupabaseServerEnvironmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DEFAULT_ORGANIZATION_ID: process.env.DEFAULT_ORGANIZATION_ID,
  });

  if (!parsedEnvironment.success) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and DEFAULT_ORGANIZATION_ID to .env.local.",
    );
  }

  return parsedEnvironment.data;
}

export function getDataSourceEnvironment() {
  const parsedEnvironment = DataSourceEnvironmentSchema.safeParse({
    DATA_SOURCE: process.env.DATA_SOURCE,
  });

  if (!parsedEnvironment.success) {
    return { DATA_SOURCE: "local" as const };
  }

  return parsedEnvironment.data;
}

export function getN8nEnvironment() {
  const parsedEnvironment = N8nEnvironmentSchema.safeParse({
    N8N_WEBHOOK_SECRET: process.env.N8N_WEBHOOK_SECRET,
  });

  if (!parsedEnvironment.success) {
    throw new Error(
      "n8n webhook secret is not configured. Add N8N_WEBHOOK_SECRET to .env.local.",
    );
  }

  return parsedEnvironment.data;
}
