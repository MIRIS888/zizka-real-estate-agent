"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  BarChart2,
  Database,
  FileText,
  LoaderCircle,
  Mail,
  MessageSquare,
  Plus,
  Radar,
  Send,
} from "lucide-react";
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
  type ChatResponse,
} from "@/lib/contracts/chat";

type ResponseArtifact = NonNullable<ChatResponse["artifact"]>;
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
  color: string;
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
};

const QUICK_PROMPTS: QuickPrompt[] = [
  {
    prompt:
      "Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?",
    label: "Analytika",
    icon: BarChart2,
    color: "#1D6B48",
  },
  {
    prompt:
      "Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.",
    label: "Analytika",
    icon: BarChart2,
    color: "#1D6B48",
  },
  {
    prompt:
      "Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.",
    label: "E-mail",
    icon: Mail,
    color: "#B8893B",
  },
  {
    prompt:
      "Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.",
    label: "Kvalita dat",
    icon: Database,
    color: "#C05621",
  },
  {
    prompt:
      "Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.",
    label: "Report",
    icon: FileText,
    color: "#6B40A0",
  },
  {
    prompt:
      "Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.",
    label: "Monitoring",
    icon: Radar,
    color: "#1A7A7A",
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

function createThreadTitle(message: string) {
  const trimmed = message.trim();
  return trimmed.length <= 44 ? trimmed : `${trimmed.slice(0, 41)}…`;
}

function ArtifactView({ artifact }: { artifact: ResponseArtifact }) {
  return (
    <div className="mt-4 overflow-hidden rounded-lg border bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b bg-[var(--surface-muted)] px-4 py-2.5">
        <p className="text-xs font-semibold text-[var(--foreground)]">
          {artifact.title}
        </p>
        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">
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
                <tr
                  key={i}
                  className="border-b last:border-0 hover:bg-[var(--surface-muted)]/50"
                >
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
                stroke="#DDD9D0"
                strokeDasharray="3 3"
                vertical={false}
              />
              <XAxis
                dataKey={artifact.xKey}
                tick={{ fontSize: 11, fill: "#5E6762" }}
                tickLine={false}
                axisLine={{ stroke: "#DDD9D0" }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#5E6762" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #DDD9D0",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {(artifact.yKeys ?? (artifact.yKey ? [artifact.yKey] : [])).map(
                (key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    radius={[4, 4, 0, 0]}
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

export function AgentChat() {
  const [message, setMessage] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>(() => [createThread()]);
  const [activeThreadId, setActiveThreadId] = useState(() => threads[0].id);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeThread = threads.find((t) => t.id === activeThreadId);
  const activeMessages = activeThread?.messages ?? [];

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
    const userMsg: ChatMessage = { id: createId(), role: "user", content: trimmed };

    updateActiveThread((t) => ({
      ...t,
      title: t.messages.length === 0 ? createThreadTitle(trimmed) : t.title,
      messages: [...t.messages, userMsg],
    }));
    setMessage("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
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
    <section className="flex min-h-[640px] flex-1 overflow-hidden rounded-xl border bg-[var(--surface)] shadow-sm lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
      {/* Thread sidebar */}
      <aside className="flex flex-col border-b bg-[var(--surface-muted)] lg:border-b-0 lg:border-r">
        <div className="p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            <Plus className="size-3.5" />
            Nový dotaz
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--foreground-muted)]">
            Historie
          </p>
          <div className="space-y-0.5">
            {threads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                onClick={() => {
                  setActiveThreadId(thread.id);
                  setError(null);
                }}
                className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                  thread.id === activeThreadId
                    ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--foreground-muted)] hover:bg-[var(--surface)]/60 hover:text-[var(--foreground)]"
                }`}
              >
                <MessageSquare className="mt-0.5 size-3.5 shrink-0" />
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
      </aside>

      {/* Main chat */}
      <div className="flex min-w-0 flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b px-5 py-3.5">
          <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">
            {activeThread?.title ?? "Nový dotaz"}
          </h2>
          <div className="flex shrink-0 items-center gap-2">
            {googleStatus?.connected ? (
              <>
                <span className="size-1.5 rounded-full bg-emerald-500" />
                <span className="text-xs text-[var(--foreground-muted)]">
                  Google připojen
                </span>
                <button
                  type="button"
                  onClick={() => void handleDisconnectGoogle()}
                  className="ml-0.5 text-[10px] text-[var(--foreground-muted)] underline-offset-2 hover:underline"
                >
                  Odpojit
                </button>
              </>
            ) : (
              <a
                href="/api/auth/google/start"
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
                  googleStatus?.configured
                    ? "bg-[var(--primary)] text-white hover:bg-[var(--primary-strong)]"
                    : "pointer-events-none bg-[var(--surface-muted)] text-[var(--foreground-muted)]"
                }`}
              >
                Připojit Google
              </a>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {activeMessages.length === 0 ? (
            <div className="flex h-full flex-col">
              <div className="mb-5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--foreground-muted)]">
                  Pracovní scénáře
                </p>
                <p className="mt-1 text-sm text-[var(--foreground-muted)]">
                  Vyberte připravený scénář nebo napište vlastní dotaz níže.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map(({ prompt, label, icon: Icon, color }) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => setMessage(prompt)}
                    className="group flex items-start gap-3 rounded-xl border bg-[var(--surface-muted)]/60 p-3.5 text-left transition hover:border-[var(--primary)] hover:bg-[var(--surface)]"
                  >
                    <div
                      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md"
                      style={{
                        backgroundColor: `${color}1a`,
                        color,
                      }}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <span
                        className="mb-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          backgroundColor: `${color}1a`,
                          color,
                        }}
                      >
                        {label}
                      </span>
                      <p className="text-xs leading-5 text-[var(--foreground)]">
                        {prompt}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {googleStatus && !googleStatus.connected && (
                <p className="mt-4 text-xs text-[var(--foreground-muted)]">
                  Pro scénáře s kalendářem a e-mailem připojte Google účet tlačítkem výše.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {activeMessages.map((msg) =>
                msg.role === "user" ? (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[var(--primary)] px-4 py-3 text-sm leading-6 text-white">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div
                    key={msg.id}
                    className="max-w-2xl rounded-xl border bg-[var(--surface)] py-4 pl-5 pr-4"
                    style={{
                      borderLeftColor: INTENT_COLOR[msg.response.intent],
                      borderLeftWidth: 3,
                    }}
                  >
                    <p className="whitespace-pre-line text-sm leading-7 text-[var(--foreground)]">
                      {msg.response.message}
                    </p>
                    {msg.response.artifact && (
                      <ArtifactView artifact={msg.response.artifact} />
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-2.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          backgroundColor: `${INTENT_COLOR[msg.response.intent]}1a`,
                          color: INTENT_COLOR[msg.response.intent],
                        }}
                      >
                        {INTENT_LABEL[msg.response.intent]}
                      </span>
                      {msg.response.source && (
                        <span className="text-[10px] text-[var(--foreground-muted)]">
                          Zdroj: {msg.response.source.label}
                          {" · "}
                          {SOURCE_LABELS[msg.response.source.mode]}
                        </span>
                      )}
                      {msg.response.requiresConfirmation && (
                        <span className="rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          Vyžaduje potvrzení před odesláním
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
              <div ref={messagesEndRef} />
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <form onSubmit={handleSubmit} className="relative">
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
              placeholder="Napište dotaz nebo vyberte scénář výše… (Enter odešle, Shift+Enter nový řádek)"
              rows={2}
              className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-3 pr-14 text-sm text-[var(--foreground)] outline-none transition placeholder:text-[var(--foreground-muted)] focus:border-[var(--primary)] focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--primary)]/10"
            />
            <button
              type="submit"
              disabled={isLoading || !message.trim()}
              aria-label="Odeslat dotaz"
              className="absolute bottom-2.5 right-2.5 grid size-9 place-items-center rounded-lg bg-[var(--primary)] text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-40"
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
    </section>
  );
}
