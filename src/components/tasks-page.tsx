"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  Calendar,
  Clock,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Moon,
  Pause,
  Play,
  Plus,
  Sun,
  Trash2,
} from "lucide-react";
import Link from "next/link";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ScheduledTask } from "@/lib/tasks/scheduled-tasks";

type LastRun = {
  status: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
};

type TaskWithRun = ScheduledTask & { last_run: LastRun | null };

type TasksResponse = { tasks: TaskWithRun[]; googleEmail: string | null };

function useTheme() {
  const [dark, setDark] = useState(() =>
    typeof document === "undefined"
      ? false
      : document.documentElement.classList.contains("dark"),
  );

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return { dark, toggle };
}

function formatLocalTime(isoString: string | null, timezone = "Europe/Prague") {
  if (!isoString) return "—";
  return new Intl.DateTimeFormat("cs-CZ", {
    timeZone: timezone,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoString));
}

function FrequencyBadge({ frequency }: { frequency: string }) {
  return (
    <span className="rounded bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
      {frequency === "daily" ? "každý den" : frequency}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className="rounded px-2 py-0.5 text-[10px] font-semibold"
      style={{
        backgroundColor: isActive ? "#1D4D3818" : "var(--surface-muted)",
        color: isActive ? "var(--primary)" : "var(--foreground-muted)",
      }}
    >
      {isActive ? "Aktivní" : "Pozastavená"}
    </span>
  );
}

export function TasksPage() {
  const { dark, toggle: toggleTheme } = useTheme();
  const [tasks, setTasks] = useState<TaskWithRun[]>([]);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;
    void fetch("/api/tasks")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Nepodařilo se načíst úlohy."))))
      .then((data: TasksResponse) => {
        if (mounted) {
          setTasks(data.tasks);
          setGoogleEmail(data.googleEmail);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Neočekávaná chyba.");
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  async function handleToggle(task: TaskWithRun) {
    setBusyIds((s) => new Set(s).add(task.id));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !task.is_active }),
      });
      if (!res.ok) throw new Error("Nepodařilo se změnit stav.");
      setTasks((ts) =>
        ts.map((t) => (t.id === task.id ? { ...t, is_active: !t.is_active } : t)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba.");
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  }

  function taskLabel(task: TaskWithRun): string {
    if (task.task_type === "morning_report") return "Ranní report";
    const loc = (task.params as { location?: string }).location;
    return loc ? `Realitní přehled — ${loc}` : "Realitní přehled";
  }

  async function handleDelete(task: TaskWithRun) {
    if (!confirm(`Opravdu smazat: ${taskLabel(task)}?`)) return;
    setBusyIds((s) => new Set(s).add(task.id));
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Nepodařilo se smazat úlohu.");
      setTasks((ts) => ts.filter((t) => t.id !== task.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba.");
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  }

  return (
    <div className="flex h-full bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r bg-[var(--sidebar)]">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--primary)]">
            <Building2 className="size-3.5 text-white" />
          </div>
          <div className="leading-none">
            <p className="text-sm font-semibold text-[var(--foreground)]">Žižka</p>
            <p className="mt-0.5 text-[11px] text-[var(--foreground-muted)]">
              Back Office
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="p-2 pt-3">
          <Link
            href="/"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <MessageSquare className="size-3.5 shrink-0" />
            Chat s agentem
          </Link>
          <Link
            href="/tasks"
            className="flex w-full items-center gap-2.5 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--foreground)] shadow-sm transition"
          >
            <Clock className="size-3.5 shrink-0" />
            Naplánované úlohy
          </Link>
        </div>

        <div className="min-h-0 flex-1" />

        {/* Footer */}
        <div className="shrink-0 space-y-0.5 border-t p-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            {dark ? <Sun className="size-3.5 shrink-0" /> : <Moon className="size-3.5 shrink-0" />}
            {dark ? "Světlý motiv" : "Tmavý motiv"}
          </button>
          <button
            type="button"
            onClick={async () => {
              const supabase = createSupabaseBrowserClient();
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <svg className="size-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Odhlásit se
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-6">
          <h1 className="text-sm font-semibold text-[var(--foreground)]">
            Naplánované úlohy
          </h1>
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-[var(--foreground-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--foreground)]"
          >
            <Plus className="size-3" />
            Nová úloha v chatu
          </Link>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-[var(--primary)]" />
            </div>
          ) : error ? (
            <div className="mx-auto max-w-2xl px-6 py-12">
              <p
                className="rounded-lg px-4 py-3 text-sm"
                style={{ backgroundColor: "var(--error-bg)", color: "var(--error-text)" }}
              >
                {error}
              </p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-[var(--surface-muted)]">
                <Clock className="size-6 text-[var(--foreground-muted)]" />
              </div>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Žádné naplánované úlohy
              </p>
              <p className="max-w-xs text-xs leading-5 text-[var(--foreground-muted)]">
                Řekněte agentovi v chatu:{" "}
                <em>Posílej mi každé ráno nabídky z Praha Holešovice</em>
              </p>
              <Link
                href="/"
                className="mt-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[var(--primary-strong)]"
              >
                Přejít do chatu
              </Link>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-3 px-6 py-6">
              <p className="text-xs text-[var(--foreground-muted)]">
                {tasks.length} {tasks.length === 1 ? "úloha" : tasks.length < 5 ? "úlohy" : "úloh"}
              </p>
              {tasks.map((task) => {
                const params = task.params as { location?: string; transaction?: string; recipient_email?: string };
                const isBusy = busyIds.has(task.id);
                const lastRun = task.last_run;
                const lastRunFailed = lastRun?.status === "failed";
                return (
                  <div
                    key={task.id}
                    className={`overflow-hidden rounded-xl border bg-[var(--surface)] transition ${!task.is_active ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1 space-y-2.5">
                        {/* Title row */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-[var(--foreground)]">
                            {taskLabel(task)}
                          </span>
                          <StatusBadge isActive={task.is_active} />
                          <FrequencyBadge frequency={task.task_type === "morning_report" ? "Po–Pá" : task.frequency} />
                          {params.transaction === "rent" && (
                            <span className="rounded bg-[var(--accent-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                              pronájem
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--foreground-muted)]">
                          {params.location && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="size-3 shrink-0" />
                              {params.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Clock className="size-3 shrink-0" />
                            {task.schedule_time} ({task.timezone.replace("Europe/", "")})
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Calendar className="size-3 shrink-0" />
                            Příště: {formatLocalTime(task.next_run_at, task.timezone)}
                          </span>
                          {task.last_run_at && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="size-3 shrink-0 opacity-60" />
                              Naposledy: {formatLocalTime(task.last_run_at, task.timezone)}
                            </span>
                          )}
                          {googleEmail && (
                            <span className="flex items-center gap-1.5 opacity-70">
                              <svg className="size-3 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>
                              {googleEmail}
                            </span>
                          )}
                        </div>

                        {/* Last run error */}
                        {lastRunFailed && lastRun.error_message && (
                          <p
                            className="rounded px-2 py-1 text-[11px] leading-4"
                            style={{ backgroundColor: "var(--error-bg)", color: "var(--error-text)" }}
                          >
                            Poslední chyba: {lastRun.error_message}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleToggle(task)}
                          title={task.is_active ? "Pozastavit" : "Aktivovat"}
                          className="grid size-8 place-items-center rounded-lg border text-[var(--foreground-muted)] transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isBusy ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : task.is_active ? (
                            <Pause className="size-3.5" />
                          ) : (
                            <Play className="size-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleDelete(task)}
                          title="Smazat úlohu"
                          className="grid size-8 place-items-center rounded-lg border text-[var(--foreground-muted)] transition hover:border-red-400/40 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isBusy ? (
                            <LoaderCircle className="size-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
