import { z } from "zod";

import { createSupabaseServiceClient } from "@/lib/supabase/server";

// ─── Timezone utilities (DST-safe, no external library) ──────────────────────

function getLocalParts(utc: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utc);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0");
  const h = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: h === 24 ? 0 : h, // guard: some locales return 24 for midnight
    minute: get("minute"),
  };
}

function getOffsetMs(date: Date, timezone: string): number {
  const local = getLocalParts(date, timezone);
  const localMs = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  return localMs - date.getTime(); // positive = east of UTC
}

// Converts a local calendar day + time to a UTC Date, DST-safe via 2-pass correction.
function localDayTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const approxUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset1 = getOffsetMs(approxUtc, timezone);
  const corrected = new Date(approxUtc.getTime() - offset1);
  const offset2 = getOffsetMs(corrected, timezone);
  if (offset1 === offset2) return corrected;
  return new Date(approxUtc.getTime() - offset2);
}

// Returns the next UTC instant when `scheduleTime` (HH:MM) occurs in `timezone`,
// after `afterDate` (defaults to now). Checks today then tomorrow.
export function computeNextRunAt(scheduleTime: string, timezone: string, afterDate?: Date): Date {
  const [h, m] = scheduleTime.split(":").map(Number);
  const now = afterDate ?? new Date();

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 86_400_000);
    const local = getLocalParts(probe, timezone);
    const candidate = localDayTimeToUtc(local.year, local.month, local.day, h, m, timezone);
    if (candidate > now) return candidate;
  }

  // Fallback: day after tomorrow (edge case — should not happen in normal operation)
  const d2 = new Date(now.getTime() + 2 * 86_400_000);
  const local = getLocalParts(d2, timezone);
  return localDayTimeToUtc(local.year, local.month, local.day, h, m, timezone);
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const ScheduledTaskParamsSchema = z.object({
  location: z.string(),
  transaction: z.enum(["sale", "rent"]).default("sale"),
  recipient_email: z.string().optional(),
});

const ScheduledTaskRowSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  task_type: z.literal("market_digest"),
  params: ScheduledTaskParamsSchema,
  schedule_time: z.string(),
  timezone: z.string(),
  frequency: z.literal("daily"),
  is_active: z.boolean(),
  last_run_at: z.string().nullable(),
  next_run_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type ScheduledTask = z.infer<typeof ScheduledTaskRowSchema>;

export const CreateScheduledTaskInputSchema = z.object({
  task_type: z.literal("market_digest"),
  location: z.string().min(1),
  transaction: z.enum(["sale", "rent"]).default("sale"),
  schedule_time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string().min(1).default("Europe/Prague"),
  frequency: z.literal("daily").default("daily"),
  recipient_email: z.string().optional(),
});

export type CreateScheduledTaskInput = z.infer<typeof CreateScheduledTaskInputSchema>;

export const UpdateScheduledTaskInputSchema = z.object({
  id: z.string().uuid(),
  schedule_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  transaction: z.enum(["sale", "rent"]).optional(),
});

export type UpdateScheduledTaskInput = z.infer<typeof UpdateScheduledTaskInputSchema>;

// ─── Service functions ────────────────────────────────────────────────────────

export async function createScheduledTask(
  userId: string,
  input: CreateScheduledTaskInput,
): Promise<ScheduledTask> {
  const supabase = createSupabaseServiceClient();
  const now = new Date().toISOString();
  const nextRunAt = computeNextRunAt(input.schedule_time, input.timezone);

  const { data, error } = await supabase
    .from("scheduled_tasks")
    .insert({
      user_id: userId,
      task_type: input.task_type,
      params: {
        location: input.location,
        transaction: input.transaction,
        ...(input.recipient_email ? { recipient_email: input.recipient_email } : {}),
      },
      schedule_time: input.schedule_time,
      timezone: input.timezone,
      frequency: input.frequency,
      is_active: true,
      next_run_at: nextRunAt.toISOString(),
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) throw new Error(`Nepodařilo se vytvořit úlohu: ${error.message}`);
  return ScheduledTaskRowSchema.parse(data);
}

export async function listScheduledTasks(userId: string): Promise<ScheduledTask[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("scheduled_tasks")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Nepodařilo se načíst úlohy: ${error.message}`);
  return (data ?? []).map((row) => ScheduledTaskRowSchema.parse(row));
}

export async function updateScheduledTask(
  id: string,
  userId: string,
  patch: Omit<UpdateScheduledTaskInput, "id">,
): Promise<ScheduledTask> {
  const supabase = createSupabaseServiceClient();

  const { data: existing, error: findError } = await supabase
    .from("scheduled_tasks")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (findError || !existing) throw new Error("Úloha nenalezena nebo nemáte oprávnění.");

  const current = ScheduledTaskRowSchema.parse(existing);
  const scheduleTime = patch.schedule_time ?? current.schedule_time;
  const timezone = patch.timezone ?? current.timezone;

  const { data, error } = await supabase
    .from("scheduled_tasks")
    .update({
      schedule_time: scheduleTime,
      timezone,
      params: {
        ...current.params,
        ...(patch.location ? { location: patch.location } : {}),
        ...(patch.transaction ? { transaction: patch.transaction } : {}),
      },
      next_run_at: computeNextRunAt(scheduleTime, timezone).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw new Error(`Nepodařilo se aktualizovat úlohu: ${error.message}`);
  return ScheduledTaskRowSchema.parse(data);
}

export async function deleteScheduledTask(id: string, userId: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("scheduled_tasks")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(`Nepodařilo se smazat úlohu: ${error.message}`);
}

// Used by the /tasks UI — returns all tasks (active + inactive) for a user
export async function listAllScheduledTasks(userId: string): Promise<ScheduledTask[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("scheduled_tasks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Nepodařilo se načíst úlohy: ${error.message}`);
  return (data ?? []).map((row) => ScheduledTaskRowSchema.parse(row));
}

// Toggles is_active without deleting the record
export async function toggleScheduledTask(id: string, userId: string, isActive: boolean): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const { error } = await supabase
    .from("scheduled_tasks")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw new Error(`Nepodařilo se změnit stav úlohy: ${error.message}`);
}

// Used by the cron runner — fetches all overdue tasks regardless of user
export async function getDueScheduledTasks(): Promise<ScheduledTask[]> {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("scheduled_tasks")
    .select("*")
    .eq("is_active", true)
    .lte("next_run_at", new Date().toISOString());

  if (error) throw new Error(`Nepodařilo se načíst úlohy: ${error.message}`);
  return (data ?? []).map((row) => ScheduledTaskRowSchema.parse(row));
}

// Updates last_run_at and advances next_run_at after a successful execution
export async function markTaskRun(id: string, scheduleTime: string, timezone: string): Promise<void> {
  const supabase = createSupabaseServiceClient();
  const now = new Date();
  const { error } = await supabase
    .from("scheduled_tasks")
    .update({
      last_run_at: now.toISOString(),
      next_run_at: computeNextRunAt(scheduleTime, timezone, now).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(`Nepodařilo se aktualizovat stav úlohy: ${error.message}`);
}
