"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  BarChart2,
  Building2,
  Clipboard,
  Clock,
  Database,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  LogOut,
  Mail,
  MessageSquare,
  Moon,
  Plus,
  Radar,
  Send,
  Sun,
} from "lucide-react";
import Link from "next/link";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChatResponseSchema,
  type ChatHistoryItem,
  type ChatResponse,
} from "@/lib/contracts/chat";
import { MarkdownMessage } from "@/components/markdown-message";

type ResponseArtifact = NonNullable<ChatResponse["artifact"]>;
type GeneratedOutput = NonNullable<ChatResponse["generatedOutputs"]>[number];
type ResponseSource = NonNullable<ChatResponse["source"]>;
type ChatMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; response: ChatResponse };

type ChatThread = {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
};

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  scopes: string[];
};

type QuickPrompt = {
  prompt: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const CHART_COLORS = ["#1D4D38", "#B8893B", "#1A5C8C", "#6B40A0"];

const INTENT_COLOR: Record<ChatResponse["intent"], string> = {
  analytics: "#1D6B48",
  calendar: "#1A5C8C",
  email: "#B8893B",
  data_quality: "#C05621",
  report: "#6B40A0",
  market_watch: "#1A7A7A",
  general: "#8A8F8B",
};

const INTENT_LABEL: Record<ChatResponse["intent"], string> = {
  analytics: "Analytika",
  calendar: "Kalendář",
  email: "E-mail",
  data_quality: "Kvalita dat",
  report: "Report",
  market_watch: "Monitoring",
  general: "Obecné",
};

const SOURCE_LABELS: Record<ResponseSource["mode"], string> = {
  local_demo: "Demo data",
  supabase: "Databáze",
  planned_integration: "Integrace",
  live: "Živě",
  mock_fallback: "Demo záloha",
  not_configured: "Nepřipojeno",
};

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    prompt:
      "Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?",
    label: "Analytika",
    icon: BarChart2,
  },
  {
    prompt:
      "Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.",
    label: "E-mail",
    icon: Mail,
  },
  {
    prompt:
      "Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách.",
    label: "Kvalita dat",
    icon: Database,
  },
  {
    prompt:
      "Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.",
    label: "Report",
    icon: FileText,
  },
  {
    prompt:
      "Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.",
    label: "Analytika",
    icon: BarChart2,
  },
  {
    prompt:
      "Sleduj hlavní realitní servery a informuj mě o nových nemovitostech na prodej v lokalitě Praha Holešovice.",
    label: "Monitoring",
    icon: Radar,
  },
];

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createThread(): ChatThread {
  return {
    id: createId(),
    title: "Nový dotaz",
    createdAt: new Date().toLocaleDateString("cs-CZ", {
      day: "2-digit",
      month: "2-digit",
    }),
    messages: [],
  };
}

function buildHistory(messages: ChatMessage[]): ChatHistoryItem[] {
  return messages.slice(-16).map((msg) => {
    if (msg.role === "user") {
      return { role: "user" as const, content: msg.content };
    }
    let content = msg.response.message;
    const draft = msg.response.emailDraft;
    if (draft?.to) {
      content += `\n\n[E-mail draft: Komu: ${draft.to}, Předmět: ${draft.subject}, Text: ${draft.body}]`;
    }
    return { role: "assistant" as const, content };
  });
}

function createThreadTitle(message: string) {
  const trimmed = message.trim();
  return trimmed.length <= 44 ? trimmed : `${trimmed.slice(0, 41)}…`;
}

function MarketListingsView({ artifact }: { artifact: ResponseArtifact }) {
  if (artifact.type !== "table") return null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-[var(--foreground)]">
            {artifact.title}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--foreground-muted)]">
            {artifact.rows.length} nalezených výsledků
          </p>
        </div>
        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          nabídky
        </span>
      </div>

      <div className="divide-y">
        {artifact.rows.map((row, index) => {
          const title = String(row.title ?? "Nabídka bez názvu");
          const description = String(row.description ?? "");
          const source = String(row.source ?? "");
          const url = String(row.url ?? "");

          return (
            <article key={`${url}-${index}`} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="line-clamp-2 text-sm font-semibold leading-5 text-[var(--foreground)] transition hover:text-[var(--primary)]"
                  >
                    {title}
                  </a>
                  {description && (
                    <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-[var(--foreground-muted)]">
                      {description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {source && (
                      <span className="rounded bg-[var(--surface)] px-2 py-1 text-[10px] font-medium text-[var(--foreground-muted)]">
                        {source}
                      </span>
                    )}
                    {url && (
                      <span className="max-w-[320px] truncate text-[10px] text-[var(--foreground-muted)]">
                        {url}
                      </span>
                    )}
                  </div>
                </div>
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="grid size-8 shrink-0 place-items-center rounded-lg border bg-[var(--surface)] text-[var(--foreground-muted)] transition hover:border-[var(--primary)]/40 hover:text-[var(--primary)]"
                    aria-label="Otevřít nabídku"
                    title="Otevřít nabídku"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function ArtifactView({
  artifact,
  intent,
}: {
  artifact: ResponseArtifact;
  intent: ChatResponse["intent"];
}) {
  if (intent === "market_watch" && artifact.type === "table") {
    return <MarketListingsView artifact={artifact} />;
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border bg-[var(--surface-muted)]">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-xs font-semibold text-[var(--foreground)]">
          {artifact.title}
        </p>
        <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          {artifact.type === "table" ? "tabulka" : "graf"}
        </span>
      </div>
      {artifact.type === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b">
                {artifact.columns.map((col) => (
                  <th
                    key={col}
                    className="px-4 py-2.5 font-semibold text-[var(--foreground-muted)]"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artifact.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0">
                  {artifact.columns.map((col) => (
                    <td key={col} className="px-4 py-3 text-[var(--foreground)]">
                      {row[col]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-64 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={artifact.data} margin={{ left: -20, right: 8 }}>
              <CartesianGrid
                stroke="var(--border)"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey={artifact.xKey}
                tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "var(--foreground-muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  color: "var(--foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {(artifact.yKeys ?? (artifact.yKey ? [artifact.yKey] : [])).map(
                (key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    radius={[3, 3, 0, 0]}
                  />
                ),
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function downloadGeneratedOutput(output: GeneratedOutput) {
  const blob = new Blob([output.content], { type: output.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = output.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function GeneratedOutputsView({ outputs }: { outputs: GeneratedOutput[] }) {
  if (outputs.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl border bg-[var(--surface)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          Generated outputs
        </p>
        <span className="text-[10px] text-[var(--foreground-muted)]">
          {outputs.length} souboru
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {outputs.map((output) => (
          <button
            key={`${output.filename}-${output.title}`}
            type="button"
            onClick={() => downloadGeneratedOutput(output)}
            className="flex items-center gap-2 rounded-lg border bg-[var(--surface-muted)] px-3 py-2 text-left text-xs transition hover:border-[var(--primary)]/40"
          >
            <Download className="size-3.5 shrink-0 text-[var(--primary)]" />
            <span className="min-w-0">
              <span className="block truncate font-medium text-[var(--foreground)]">
                {output.title}
              </span>
              <span className="block truncate text-[10px] text-[var(--foreground-muted)]">
                {output.filename}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function EmailDraftView({
  draft,
}: {
  draft: { to: string; subject: string; body: string };
}) {
  return (
    <div className="mt-4 rounded-xl border bg-[var(--surface)] px-5 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
          Návrh e-mailu
        </p>
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(draft.body)}
          className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-medium text-[var(--foreground-muted)] transition hover:border-[var(--primary)]/40 hover:text-[var(--foreground)]"
        >
          <Clipboard className="size-3" />
          Kopírovat
        </button>
      </div>
      <p className="mb-0.5 text-xs text-[var(--foreground-muted)]">
        <span className="text-[var(--foreground-muted)]">Komu: </span>
        <span className="font-medium text-[var(--foreground)]">{draft.to}</span>
      </p>
      <p className="mb-4 text-xs text-[var(--foreground-muted)]">
        <span className="text-[var(--foreground-muted)]">Předmět: </span>
        <span className="text-[var(--foreground)]">{draft.subject}</span>
      </p>
      <p className="whitespace-pre-wrap text-sm leading-7 text-[var(--foreground)]">
        {draft.body}
      </p>
    </div>
  );
}

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

const THREADS_STORAGE_KEY = "zizka_chat_threads";
const ACTIVE_THREAD_STORAGE_KEY = "zizka_chat_active_thread";

function loadThreadsFromStorage(): ChatThread[] {
  if (typeof window === "undefined") return [createThread()];
  try {
    const raw = localStorage.getItem(THREADS_STORAGE_KEY);
    if (!raw) return [createThread()];
    const parsed = JSON.parse(raw) as ChatThread[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [createThread()];
    return parsed;
  } catch {
    return [createThread()];
  }
}

function loadActiveThreadIdFromStorage(threads: ChatThread[]): string {
  if (typeof window === "undefined") return threads[0].id;
  try {
    const saved = localStorage.getItem(ACTIVE_THREAD_STORAGE_KEY);
    if (saved && threads.some((t) => t.id === saved)) return saved;
  } catch {
    // ignore
  }
  return threads[0].id;
}

export function AgentChat() {
  const { dark, toggle: toggleTheme } = useTheme();
  const [message, setMessage] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>(() => loadThreadsFromStorage());
  const [activeThreadId, setActiveThreadId] = useState<string>(() => {
    const t = loadThreadsFromStorage();
    return loadActiveThreadIdFromStorage(t);
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const activeMessages = activeThread?.messages ?? [];

  // Persist threads and active thread to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(THREADS_STORAGE_KEY, JSON.stringify(threads));
    } catch {
      // ignore quota errors
    }
  }, [threads]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_THREAD_STORAGE_KEY, activeThreadId);
    } catch {
      // ignore quota errors
    }
  }, [activeThreadId]);

  async function refreshGoogleStatus() {
    const res = await fetch("/api/auth/google/status");
    setGoogleStatus((await res.json()) as GoogleStatus);
  }

  useEffect(() => {
    let mounted = true;
    void fetch("/api/auth/google/status")
      .then((r) => r.json())
      .then((data) => {
        if (mounted) setGoogleStatus(data as GoogleStatus);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages.length, isLoading]);

  function handleNewChat() {
    const thread = createThread();
    setThreads((ts) => [thread, ...ts]);
    setActiveThreadId(thread.id);
    setMessage("");
    setError(null);
  }

  async function handleDisconnectGoogle() {
    await fetch("/api/auth/google/disconnect", { method: "POST" });
    await refreshGoogleStatus();
  }

  function updateActiveThread(updater: (t: ChatThread) => ChatThread) {
    setThreads((ts) =>
      ts.map((t) => (t.id === activeThreadId ? updater(t) : t)),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);
    const userMsg: ChatMessage = {
      id: createId(),
      role: "user",
      content: trimmed,
    };

    updateActiveThread((t) => ({
      ...t,
      title: t.messages.length === 0 ? createThreadTitle(trimmed) : t.title,
      messages: [...t.messages, userMsg],
    }));
    setMessage("");

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: buildHistory(activeThread?.messages ?? []),
        }),
      });
      const payload: unknown = await res.json();

      if (!res.ok) {
        const apiError =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Požadavek se nepodařilo zpracovat.";
        throw new Error(apiError);
      }

      const parsed = ChatResponseSchema.parse(payload);
      updateActiveThread((t) => ({
        ...t,
        messages: [
          ...t.messages,
          { id: createId(), role: "assistant", response: parsed },
        ],
      }));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Došlo k neočekávané chybě.",
      );
      updateActiveThread((t) => ({
        ...t,
        messages: t.messages.filter((m) => m.id !== userMsg.id),
      }));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex h-full bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r bg-[var(--sidebar)]">
        {/* Logo */}
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

        {/* Navigation + New chat */}
        <div className="p-2 pt-3 space-y-0.5">
          <div className="flex w-full items-center gap-2.5 rounded-lg bg-[var(--surface)] px-3 py-2 text-xs font-medium text-[var(--foreground)] shadow-sm">
            <MessageSquare className="size-3.5 shrink-0" />
            Chat s agentem
          </div>
          <Link
            href="/tasks"
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <Clock className="size-3.5 shrink-0" />
            Naplánované úlohy
          </Link>
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <Plus className="size-3.5 shrink-0" />
            Nový dotaz
          </button>
        </div>

        {/* Thread list */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {threads.length > 0 && (
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--foreground-muted)]">
              Historie
            </p>
          )}
          <div className="space-y-0.5">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setActiveThreadId(thread.id);
                  setError(null);
                }}
                className={`flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition ${
                  thread.id === activeThreadId
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <MessageSquare className="mt-0.5 size-3.5 shrink-0 opacity-50" />
                <span className="min-w-0">
                  <span className="line-clamp-2 block font-medium leading-5">
                    {thread.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[var(--foreground-muted)]">
                    {thread.createdAt}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Sidebar footer */}
        <div className="shrink-0 space-y-0.5 border-t p-2">
          {googleStatus?.connected ? (
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="flex-1 truncate text-xs text-[var(--foreground-muted)]">
                Google připojen
              </span>
              <button
                type="button"
                onClick={() => void handleDisconnectGoogle()}
                className="shrink-0 text-[10px] text-[var(--foreground-muted)] transition hover:text-[var(--foreground)]"
              >
                Odpojit
              </button>
            </div>
          ) : (
            <a
              href="/api/auth/google/start"
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition ${
                googleStatus?.configured
                  ? "font-medium text-[var(--primary)] hover:bg-[var(--surface-muted)]"
                  : "pointer-events-none text-[var(--foreground-muted)]"
              }`}
            >
              <span
                className={`size-1.5 shrink-0 rounded-full ${
                  googleStatus?.configured ? "bg-amber-400" : "bg-[var(--border-strong)]"
                }`}
              />
              Připojit Google
            </a>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs text-[var(--foreground-muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            {dark ? (
              <Sun className="size-3.5 shrink-0" />
            ) : (
              <Moon className="size-3.5 shrink-0" />
            )}
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
            <LogOut className="size-3.5 shrink-0" />
            Odhlásit se
          </button>
        </div>
      </aside>

      {/* Main chat */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center border-b px-6">
          <h1 className="truncate text-sm font-semibold text-[var(--foreground)]">
            {activeThread?.messages.length === 0
              ? "Chat"
              : (activeThread?.title ?? "Chat")}
          </h1>
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeMessages.length === 0 ? (
            <div className="mx-auto flex h-full max-w-[700px] flex-col justify-center px-6 py-12">
              <p className="text-2xl font-semibold text-[var(--foreground)]">
                Dobrý den, Pepo
              </p>
              <p className="mt-1.5 text-sm text-[var(--foreground-muted)]">
                Čím mohu pomoci?
              </p>
              <div className="mt-8 grid grid-cols-2 gap-2">
                {QUICK_PROMPTS.map(({ prompt, label, icon: Icon }) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
                    className="group flex items-start gap-3 rounded-xl border bg-[var(--surface)] p-4 text-left text-xs transition hover:border-[var(--primary)]/40 hover:shadow-sm"
                  >
                    <Icon className="mt-0.5 size-4 shrink-0 text-[var(--primary)] opacity-50 transition group-hover:opacity-80" />
                    <div className="min-w-0">
                      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
                        {label}
                      </span>
                      <span className="leading-5 text-[var(--foreground)]">
                        {prompt}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[700px] space-y-6 px-6 py-6">
              {activeMessages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--primary)] px-4 py-3 text-sm leading-6 text-white">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={msg.id}>
                    <MarkdownMessage content={msg.response.message} />
                    {msg.response.emailDraft && (
                      <EmailDraftView draft={msg.response.emailDraft} />
                    )}
                    {(msg.response.artifacts ??
                      (msg.response.artifact ? [msg.response.artifact] : [])
                    ).map((artifact) => (
                      <ArtifactView
                        key={`${artifact.type}-${artifact.title}`}
                        artifact={artifact}
                        intent={msg.response.intent}
                      />
                    ))}
                    {msg.response.generatedOutputs && (
                      <GeneratedOutputsView
                        outputs={msg.response.generatedOutputs}
                      />
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          backgroundColor: `${INTENT_COLOR[msg.response.intent]}18`,
                          color: INTENT_COLOR[msg.response.intent],
                        }}
                      >
                        {INTENT_LABEL[msg.response.intent]}
                      </span>
                      {msg.response.source && (
                        <span className="text-[10px] text-[var(--foreground-muted)]">
                          {msg.response.source.label}
                          {" · "}
                          {SOURCE_LABELS[msg.response.source.mode]}
                        </span>
                      )}
                      {msg.response.requiresConfirmation && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            backgroundColor: "var(--warning-bg)",
                            color: "var(--warning-text)",
                          }}
                        >
                          Vyžaduje potvrzení
                        </span>
                      )}
                    </div>
                  </div>
                ),
              )}
              {isLoading && (
                <div className="flex items-center gap-2 text-xs text-[var(--foreground-muted)]">
                  <LoaderCircle className="size-4 animate-spin text-[var(--primary)]" />
                  Agent zpracovává dotaz…
                </div>
              )}
              {error && (
                <p
                  className="rounded-lg px-4 py-3 text-xs"
                  style={{
                    backgroundColor: "var(--error-bg)",
                    color: "var(--error-text)",
                  }}
                >
                  {error}
                </p>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t px-6 py-4">
          <form
            onSubmit={handleSubmit}
            className="relative mx-auto max-w-[700px]"
          >
            <label htmlFor="agent-message" className="sr-only">
              Dotaz pro agenta
            </label>
            <textarea
              id="agent-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Napište dotaz… (Enter odešle, Shift+Enter nový řádek)"
              rows={2}
              className="w-full resize-none rounded-xl border bg-[var(--surface)] px-4 py-3 pr-14 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--border-strong)] focus:ring-2 focus:ring-[var(--primary)]/10"
            />
            <button
              type="submit"
              disabled={isLoading || !message.trim()}
              aria-label="Odeslat dotaz"
              className="absolute bottom-2.5 right-2.5 grid size-9 place-items-center rounded-lg bg-[var(--primary)] text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isLoading ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
