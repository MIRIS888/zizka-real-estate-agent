"use client";

import { FormEvent, useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
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

const CHART_COLORS = ["#17694f", "#d78a2d", "#2f6eb5", "#8b5cf6"];

function ResponseArtifactView({ artifact }: { artifact: ResponseArtifact }) {
  return (
    <div className="mt-5 rounded-xl border bg-white p-4">
      <p className="mb-3 text-sm font-semibold">{artifact.title}</p>
      {artifact.type === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b text-[var(--muted)]">
                {artifact.columns.map((column) => (
                  <th key={column} className="pb-2 pr-4 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artifact.rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b last:border-0">
                  {artifact.columns.map((column) => (
                    <td key={column} className="py-2 pr-4">
                      {row[column]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={artifact.data} margin={{ left: -20, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey={artifact.xKey} tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {(artifact.yKeys ?? (artifact.yKey ? [artifact.yKey] : [])).map(
                (key, index) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                    radius={[6, 6, 0, 0]}
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
  const [response, setResponse] = useState<ChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedMessage = message.trim();
    if (!trimmedMessage || isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const apiResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmedMessage }),
      });
      const payload: unknown = await apiResponse.json();

      if (!apiResponse.ok) {
        const apiError =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Požadavek se nepodařilo zpracovat.";
        throw new Error(apiError);
      }

      setResponse(ChatResponseSchema.parse(payload));
      setMessage("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Došlo k neočekávané chybě.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="flex min-h-[520px] flex-col rounded-2xl border bg-white shadow-[0_16px_45px_rgb(23_32_25/7%)]">
      <div className="border-b px-6 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--primary)]">
          Gemini Assistant
        </p>
        <h2 className="mt-1 text-xl font-semibold">Zadejte provozní požadavek</h2>
      </div>

      <div className="flex flex-1 flex-col justify-end p-6">
        {response ? (
          <div className="mb-6 max-w-2xl rounded-2xl rounded-bl-sm bg-[var(--surface-muted)] p-5">
            <p className="text-sm leading-7">{response.message}</p>
            {response.requiresConfirmation ? (
              <p className="mt-3 text-xs font-semibold text-amber-800">
                Před provedením akce bude vyžadováno potvrzení.
              </p>
            ) : null}
            {response.artifact ? (
              <ResponseArtifactView artifact={response.artifact} />
            ) : null}
          </div>
        ) : (
          <div className="mb-8 max-w-xl">
            <p className="text-lg font-medium">
              Začněte dotazem nad klienty, leady nebo nemovitostmi.
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Agent bude používat pouze povolené operace a u změn dat si vyžádá
              potvrzení.
            </p>
          </div>
        )}

        {error ? (
          <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="relative">
          <label htmlFor="agent-message" className="sr-only">
            Požadavek pro agenta
          </label>
          <textarea
            id="agent-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Např. ukaž nové leady za první kvartál podle zdroje…"
            rows={3}
            className="w-full resize-none rounded-2xl border bg-[#fbfcf9] px-4 py-4 pr-16 text-sm outline-none transition focus:border-[var(--primary)] focus:ring-3 focus:ring-emerald-900/10"
          />
          <button
            type="submit"
            disabled={isLoading || !message.trim()}
            className="absolute bottom-3 right-3 grid size-11 place-items-center rounded-xl bg-[var(--primary)] text-white transition hover:bg-[var(--primary-strong)] disabled:cursor-not-allowed disabled:opacity-45"
            aria-label="Odeslat požadavek"
          >
            {isLoading ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
          </button>
        </form>
      </div>
    </section>
  );
}
