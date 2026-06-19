"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  Trash2,
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
  PendingToolSchema,
  type ChatResponse,
} from "@/lib/contracts/chat";
import { type z } from "zod";

type PendingTool = z.infer<typeof PendingToolSchema>;
import { MarkdownMessage } from "@/components/markdown-message";

type ResponseArtifact = NonNullable<ChatResponse["artifact"]>;
type GeneratedOutput = NonNullable<ChatResponse["generatedOutputs"]>[number];
type ResponseSource = NonNullable<ChatResponse["source"]>;

type UIMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; response: ChatResponse };

type SidebarThread = {
  id: string;
  title: string;
  updated_at: string;
};

type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  scopes: string[];
  email?: string;
  hasRequiredScopes?: boolean;
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

export function AgentChat({ initialThreadId, userEmail }: { initialThreadId?: string; userEmail?: string } = {}) {
  const router = useRouter();
  const { dark, toggle: toggleTheme } = useTheme();
  const [message, setMessage] = useState("");
  const [uiMessages, setUiMessages] = useState<UIMessage[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(
    initialThreadId ?? null,
  );
  const [sidebarThreads, setSidebarThreads] = useState<SidebarThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(!!initialThreadId);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    token: string;
    tool: PendingTool;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load sidebar threads
  useEffect(() => {
    let mounted = true;
    void fetch("/api/chat/threads")
      .then((r) => r.json())
      .then((data: { threads?: SidebarThread[] }) => {
        if (mounted) {
          setSidebarThreads(data.threads ?? []);
          setThreadsLoading(false);
        }
      })
      .catch(() => {
        if (mounted) setThreadsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Load messages for the current thread on mount / when initialThreadId changes
  useEffect(() => {
    if (!initialThreadId) {
      return;
    }
    let mounted = true;
    void fetch(`/api/chat/threads/${initialThreadId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Thread not found");
        return r.json();
      })
      .then(
        (data: {
          messages?: { id: string; role: string; content: string }[];
        }) => {
          if (!mounted) return;
          const mapped: UIMessage[] = (data.messages ?? []).flatMap((m): UIMessage[] => {
            if (m.role === "user") {
              return [{ id: m.id, role: "user" as const, content: m.content }];
            }
            if (m.role === "assistant") {
              try {
                const parsed = ChatResponseSchema.parse(
                  JSON.parse(m.content) as unknown,
                );
                return [
                  { id: m.id, role: "assistant" as const, response: parsed },
                ];
              } catch {
                return [
                  {
                    id: m.id,
                    role: "assistant" as const,
                    response: {
                      message: m.content,
                      intent: "general" as const,
                      requiresConfirmation: false,
                    } as ChatResponse,
                  },
                ];
              }
            }
            return [];
          });
          setUiMessages(mapped);
          setMessagesLoading(false);
        },
      )
      .catch(() => {
        if (mounted) {
          setMessagesLoading(false);
          setError("Konverzaci se nepodařilo načíst.");
        }
      });
    return () => {
      mounted = false;
    };
  }, [initialThreadId]);

  // Google status
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [uiMessages.length, isLoading]);

  function refreshSidebar() {
    void fetch("/api/chat/threads")
      .then((r) => r.json())
      .then((data: { threads?: SidebarThread[] }) =>
        setSidebarThreads(data.threads ?? []),
      );
  }

  function handleNewChat() {
    setPendingConfirmation(null);
    setError(null);
    setMessage("");
    router.push("/chat/new");
  }

  async function handleDisconnectGoogle() {
    await fetch("/api/auth/google/disconnect", { method: "POST" });
    const res = await fetch("/api/auth/google/status");
    setGoogleStatus((await res.json()) as GoogleStatus);
  }

  async function handleDeleteThread(threadId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await fetch(`/api/chat/threads/${threadId}`, { method: "DELETE" });
    setSidebarThreads((ts) => ts.filter((t) => t.id !== threadId));
    if (activeThreadId === threadId) {
      router.push("/chat/new");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);

    const userMsgId = createId();
    setUiMessages((prev) => [
      ...prev,
      { id: userMsgId, role: "user", content: trimmed },
    ]);
    setMessage("");

    try {
      const requestBody: Record<string, unknown> = {
        message: trimmed,
        ...(activeThreadId ? { threadId: activeThreadId } : {}),
      };
      if (pendingConfirmation) {
        requestBody.confirmationToken = pendingConfirmation.token;
        requestBody.pendingTool = pendingConfirmation.tool;
      }

      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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
      const returnedThreadId =
        typeof payload === "object" &&
        payload !== null &&
        "threadId" in payload &&
        typeof (payload as { threadId?: unknown }).threadId === "string"
          ? (payload as { threadId: string }).threadId
          : null;

      if (parsed.confirmationToken && parsed.pendingTool) {
        setPendingConfirmation({
          token: parsed.confirmationToken,
          tool: parsed.pendingTool,
        });
      } else {
        // Always clear stale pending state when the server doesn't return a new token.
        // Prevents a stale token from being re-sent on the next message.
        setPendingConfirmation(null);
      }

      setUiMessages((prev) => [
        ...prev,
        { id: createId(), role: "assistant", response: parsed },
      ]);

      if (!activeThreadId && returnedThreadId) {
        // First message in new chat — navigate to the created thread
        setActiveThreadId(returnedThreadId);
        router.replace(`/chat/${returnedThreadId}`);
        refreshSidebar();
      } else if (activeThreadId) {
        // Bump thread to top of sidebar
        setSidebarThreads((ts) =>
          ts
            .map((t) =>
              t.id === activeThreadId
                ? { ...t, updated_at: new Date().toISOString() }
                : t,
            )
            .sort(
              (a, b) =>
                new Date(b.updated_at).getTime() -
                new Date(a.updated_at).getTime(),
            ),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Došlo k neočekávané chybě.",
      );
      setUiMessages((prev) => prev.filter((m) => m.id !== userMsgId));
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
          {!threadsLoading && sidebarThreads.length > 0 && (
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--foreground-muted)]">
              Historie
            </p>
          )}
          <div className="space-y-0.5">
            {sidebarThreads.map((thread) => (
              <div
                key={thread.id}
                className={`group relative flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left text-xs transition ${
                  thread.id === activeThreadId
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2.5"
                  onClick={() => {
                    setError(null);
                    router.push(`/chat/${thread.id}`);
                  }}
                >
                  <MessageSquare className="mt-0.5 size-3.5 shrink-0 opacity-50" />
                  <span className="min-w-0">
                    <span className="line-clamp-2 block font-medium leading-5">
                      {thread.title}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-[var(--foreground-muted)]">
                      {new Date(thread.updated_at).toLocaleDateString("cs-CZ", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => void handleDeleteThread(thread.id, e)}
                  className="absolute right-2 top-2 hidden size-5 items-center justify-center rounded text-[var(--foreground-muted)] opacity-60 transition hover:opacity-100 group-hover:flex"
                  aria-label="Smazat konverzaci"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar footer */}
        <div className="shrink-0 space-y-0.5 border-t p-2">
          {googleStatus?.connected ? (
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="flex-1 truncate text-xs text-[var(--foreground-muted)]">
                {googleStatus.email
                  ? `Google: ${googleStatus.email}`
                  : "Google připojen"}
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
              Připojit Google pro Gmail/Kalendář
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

          {userEmail && (
            <div className="flex items-center gap-2.5 rounded-lg px-3 py-1.5">
              <span className="size-1.5 shrink-0 rounded-full bg-[var(--primary)] opacity-60" />
              <span className="truncate text-[11px] text-[var(--foreground-muted)]">
                {userEmail}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={async () => {
              setGoogleStatus(null);
              await fetch("/api/auth/google/clear-cookie", { method: "POST" });
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
            {sidebarThreads.find((t) => t.id === activeThreadId)?.title ?? "Chat"}
          </h1>
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messagesLoading ? (
            <div className="flex h-full items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-[var(--primary)]" />
            </div>
          ) : uiMessages.length === 0 ? (
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
              {uiMessages.map((msg) =>
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
