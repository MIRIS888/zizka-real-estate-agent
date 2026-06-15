import {
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CircleCheckBig,
} from "lucide-react";

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
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
      <header className="mb-8 flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-[var(--primary)]">
            Real Estate Operations
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Přehled back office
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm text-[var(--muted)] shadow-sm">
          <span className="size-2 rounded-full bg-emerald-500" />
          Gemini agent připraven
        </div>
      </header>

      <section className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon }) => (
          <article
            key={label}
            className="rounded-2xl border bg-[var(--surface)] p-5 shadow-[0_12px_35px_rgb(23_32_25/5%)]"
          >
            <div className="mb-5 flex items-start justify-between">
              <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
              <Icon className="size-5 text-[var(--primary)]" />
            </div>
            <p className="text-3xl font-semibold">{value}</p>
            <p className="mt-2 text-xs text-[var(--muted)]">{detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <AgentChat />

        <aside className="rounded-2xl border bg-[var(--primary)] p-6 text-white shadow-[0_16px_40px_rgb(21_67_50/18%)]">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-100">
            Rychlé dotazy
          </p>
          <h2 className="mt-3 text-xl font-semibold">Co může agent vyřešit?</h2>
          <div className="mt-6 space-y-3 text-sm leading-6 text-emerald-50">
            <p>„Ukaž vývoj leadů za posledních 6 měsíců.“</p>
            <p>„Najdi nemovitosti s neúplnými údaji.“</p>
            <p>„Navrhni termín prohlídky a připrav e-mail.“</p>
            <p>„Vytvoř týdenní report pro vedení.“</p>
          </div>
          <div className="mt-8 rounded-xl bg-white/10 p-4 text-xs leading-5 text-emerald-50">
            Akce jako odeslání e-mailu nebo změna dat budou vždy vyžadovat
            potvrzení.
          </div>
        </aside>
      </section>
    </main>
  );
}
