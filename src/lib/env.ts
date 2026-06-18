import { z } from "zod";

const ServerEnvironmentSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.5-flash"),
});

const SupabaseServerEnvironmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DEFAULT_ORGANIZATION_ID: z.uuid(),
});

const DataSourceEnvironmentSchema = z.object({
  DATA_SOURCE: z.enum(["local", "supabase"]).default("local"),
});

const CronEnvironmentSchema = z.object({
  CRON_SECRET: z.string().min(16),
});

const GoogleOAuthEnvironmentSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

const FirecrawlEnvironmentSchema = z.object({
  FIRECRAWL_API_KEY: z.string().min(1),
  FIRECRAWL_API_URL: z.url().default("https://api.firecrawl.dev/v2"),
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

export function isGeminiConfigured() {
  return ServerEnvironmentSchema.safeParse({
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
  }).success;
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

export function getCronSecret(): string | undefined {
  const parsed = CronEnvironmentSchema.safeParse({ CRON_SECRET: process.env.CRON_SECRET });
  return parsed.success ? parsed.data.CRON_SECRET : undefined;
}

export function getGoogleOAuthEnvironment() {
  const parsedEnvironment = GoogleOAuthEnvironmentSchema.safeParse({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  });

  if (!parsedEnvironment.success) {
    throw new Error(
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to environment variables.",
    );
  }

  return parsedEnvironment.data;
}

export function isGoogleOAuthConfigured() {
  return GoogleOAuthEnvironmentSchema.safeParse({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  }).success;
}

export function getFirecrawlEnvironment() {
  const parsedEnvironment = FirecrawlEnvironmentSchema.safeParse({
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    FIRECRAWL_API_URL: process.env.FIRECRAWL_API_URL,
  });

  if (!parsedEnvironment.success) {
    throw new Error(
      "Firecrawl is not configured. Add FIRECRAWL_API_KEY to .env.local.",
    );
  }

  return parsedEnvironment.data;
}

export function isFirecrawlConfigured() {
  return FirecrawlEnvironmentSchema.safeParse({
    FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,
    FIRECRAWL_API_URL: process.env.FIRECRAWL_API_URL,
  }).success;
}
