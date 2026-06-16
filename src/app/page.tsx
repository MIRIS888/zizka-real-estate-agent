import { Building2, CalendarDays, ChartNoAxesCombined, CircleCheckBig } from "lucide-react";

import { AgentChat } from "@/components/agent-chat";

const metrics = [
  {
    label: "Aktivní nabídky",
    value: "24",
    detail: "3 nové tento týden",
    icon: Building2,
  },
  {
    label: "Nové leady",
    value: "18",
    detail: "Za posledních 30 dní",
    icon: ChartNoAxesCombined,
  },
  {
    label: "Naplánované prohlídky",
    value: "7",
    detail: "V příštích 7 dnech",
    icon: CalendarDays,
  },
  {
    label: "Úkoly k doplnění",
    value: "5",
    detail: "Chybějící data nemovitostí",
    icon: CircleCheckBig,
  },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg)]">
      <nav className="border-b bg-[var(--surface)]">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Building2 className="size-4 text-[var(--primary)]" />
            <span className="text-sm font-semibold text-[var(--foreground)]">
              Žižka Reality
            </span>
            <span className="text-[var(--border-strong)]">·</span>
            <span className="text-sm text-[var(--foreground-muted)]">
              Back Office Agent
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[var(--foreground-muted)]">
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              n8n webhooks
            </span>
            <span className="hidden items-center gap-1.5 sm:flex">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Supabase ready
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Agent připraven
            </span>
          </div>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-screen-xl flex-1 flex-col px-4 py-5 sm:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <article
              key={label}
              className="rounded-xl border bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--foreground-muted)]">
                  {label}
                </p>
                <Icon className="mt-0.5 size-3.5 shrink-0 text-[var(--primary)] opacity-50" />
              </div>
              <p className="mt-3 text-3xl font-bold tracking-tight text-[var(--foreground)]">
                {value}
              </p>
              <p className="mt-1 text-xs text-[var(--foreground-muted)]">{detail}</p>
            </article>
          ))}
        </div>

        <div className="mt-4 flex flex-1 flex-col">
          <AgentChat />
        </div>
      </main>
    </div>
  );
}
