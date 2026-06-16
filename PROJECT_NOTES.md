# Project Notes

## Current State

- Project: Back Office Operations Agent for a real estate operations/back-office use case.
- Goal: demo for Saturday, then deploy to Vercel and record short demo video.
- GitHub repo: https://github.com/MIRIS888/zizka-real-estate-agent
- Repo visibility: private.
- Main branch: `main`, tracking `origin/main`.

## Source Assignment To Follow

Pepa pracuje jako back office manager ve firmě, která spravuje nemovitosti a obchoduje s nimi. Celý den se pohybuje mezi e-maily, kalendářem, tabulkami, dokumenty, interními poznámkami, meetingy a firemními systémy. Dává dohromady informace z různých míst, doplňuje chybějící data, připravuje podklady pro kolegy a vedení a zajišťuje, že se věci opravdu posunou dál. Cílem je navrhnout systém, který převezme významnou část Pepovy práce.

Task: navrhnout a postavit Back Office Operations Agenta pro firmu, která spravuje nemovitosti a obchoduje s nimi. Agent musí umět pracovat jak s dotazy nad daty, která mohou být odněkud stažená nebo vygenerovaná, tak s workflow a plánovanými úkoly.

Allowed solution choices include OpenClaw, n8n, a custom solution created through Claude Code, a combination of multiple approaches, or another pragmatic approach.

Required capabilities:

- When asked `Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?`, the agent must return a precise answer over real company-style data.
- When asked `Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.`, the agent must return a link, table, document, or visual output.
- When asked `Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.`, the agent must use calendar availability and prepare an email draft.
- When asked `Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.`, the agent must return an overview and recommend the next step.
- When asked `Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.`, the agent must create an appropriately formatted output.
- When asked `Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.`, the agent must support the recurring scheduled workflow.

This assignment is the north star for product, architecture, demo script, and deployment decisions.

## What The Demo Currently Does

- Next.js UI with dashboard and AI chat.
- Gemini-backed agent planning with deterministic demo routing for key assignment prompts.
- Local demo data for clients, leads, properties, sold properties, calendar slots, weekly report, and market listings.
- Recharts chart output in the chat UI.
- Lead intake webhook:
  - `POST /api/webhooks/n8n/leads`
  - protected by `N8N_WEBHOOK_SECRET`
- Market digest webhook:
  - `POST /api/webhooks/n8n/market-digest`
- Daily report webhook:
  - `POST /api/webhooks/n8n/daily-report`
  - validates and stores daily operations report runs in Supabase when `DATA_SOURCE=supabase`
- Live market search from chat:
  - Firecrawl Search integration is wired through `src/lib/tools/market-search.ts`
  - search is restricted to properties for sale, not rentals
  - results render as listing cards in chat instead of a generic table

## Assignment Scenarios Covered

Use these demo prompts:

- `Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?`
- `Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.`
- `Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.`
- `Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.`
- `Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.`
- `Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.`

## Important Files

- `src/components/agent-chat.tsx` - chat UI and chart/table artifact rendering.
- `src/lib/agent/run-agent.ts` - main agent execution and demo routing.
- `src/lib/tools/demo-operations.ts` - demo tools for sales chart, email draft, report, market watch.
- `src/lib/local-data/seed.ts` - local demo data.
- `src/lib/tools/lead-ingestion.ts` - webhook lead ingestion.
- `src/lib/tools/market-search.ts` - Firecrawl live search over Czech real-estate portals.
- `src/lib/tools/daily-report.ts` - n8n daily report payload validation and storage.
- `src/app/api/webhooks/n8n/leads/route.ts` - lead webhook route.
- `src/app/api/webhooks/n8n/daily-report/route.ts` - daily report webhook route.
- `src/app/api/chat/route.ts` - chat API route.
- `supabase/migrations/202606160001_daily_report_runs.sql` - storage for n8n daily reports.
- `README.md` - setup and demo prompts.

## 2026-06-16 Work Log

- Added a new n8n daily report ingestion path:
  - `src/app/api/webhooks/n8n/daily-report/route.ts`
  - `src/lib/tools/daily-report.ts`
  - `supabase/migrations/202606160001_daily_report_runs.sql`
- Documented recommended n8n workflows in `README.md`:
  - lead intake
  - daily market digest
  - daily operations report
- Added live Firecrawl market search for chat requests such as:
  - `Vyhledej nemovitosti v Holešovicích.`
  - `Vyhledej byty na prodej v Holešovicích.`
- Expanded supported market source domains:
  - Sreality, Bezrealitky, iDNES Reality, RealityMix, České reality, UlovDomov,
    Eurobydleni, RealHit, RealityMorava, RealityČechy, Bidli, RE/MAX,
    MM Reality, Svoboda & Williams, Lexxus, Engel & Völkers.
- Changed market search behavior to focus only on sale listings:
  - query includes `prodej`
  - query excludes `pronájem`, `pronajem`, `nájem`, `najem`
  - planner instruction says not to search rentals or leases.
- Improved market result rendering:
  - market results now render as compact listing cards with source badges and open-link buttons
  - other artifacts still use tables/charts.
- Configured Firecrawl:
  - local `.env.local` has `FIRECRAWL_API_KEY` and `FIRECRAWL_API_URL`
  - Vercel Production has Firecrawl env vars and has been redeployed
  - Firecrawl key was pasted in chat, so rotate it later if this moves beyond demo.
- Deployed to Vercel production:
  - main alias: `https://zizka-amber.vercel.app`
- Pushed to GitHub:
  - commit `0ce932c Add n8n reports and live market search`

## Verification Already Passed

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- API smoke tests passed for:
  - Q1 lead/source chart
  - lead and sold-property trend chart
  - email draft and calendar slot
  - missing property data
  - weekly report and 3-slide outline
  - market watch summary

## Known Notes

- The app is still a strong demo, not a production CRM.
- Local mode uses demo data. Real storage requires `DATA_SOURCE=supabase` and Supabase env vars.
- Google Calendar/Gmail are live when connected through Google OAuth.
- Real-estate portal search is live through Firecrawl Search when `FIRECRAWL_API_KEY` is configured.
- n8n workflows are designed/documented and webhook endpoints exist, but actual n8n workflow nodes still need to be built/configured.
- Browser hydration warning came from an external browser attribute on `<html>`; `suppressHydrationWarning` was added in `src/app/layout.tsx`.
- `gh` CLI is authenticated as `MIRIS888` outside the sandbox.
- `vercel` CLI is usable via `npm exec vercel -- ...`; project is linked in `.vercel/project.json`.

## Next Steps

- Build the actual n8n workflows:
  - Schedule Trigger 07:30 Europe/Prague for market search/digest
  - Schedule Trigger 08:00 Europe/Prague for daily operations report
  - HTTP Request nodes should call the app webhooks with `Authorization: Bearer <N8N_WEBHOOK_SECRET>`
  - normalize Firecrawl/search results before posting to `/api/webhooks/n8n/market-digest`
  - combine Supabase internal metrics + market digest into `/api/webhooks/n8n/daily-report`
- Apply Supabase migrations in the hosted Supabase project, especially:
  - `supabase/migrations/202606160001_daily_report_runs.sql`
- Seed or create real `market_watch_rules` rows in Supabase for locations such as Praha Holešovice.
- Verify production chat manually after each deploy:
  - `Vyhledej byty na prodej v Holešovicích.`
  - check that results are sale listings and render as cards.
- Rotate the Firecrawl API key before public demo if needed, because the original key was pasted into chat.
- Improve daily report visibility in the UI:
  - add dashboard card or page that shows latest `daily_report_runs`
  - add latest market digest card for watched locations
- Improve market result quality:
  - consider a second Firecrawl scrape step for top results to extract price, address, size, disposition, and image
  - deduplicate listings across domains
  - filter out search/category pages when they are less useful than individual listings
- Add clearer dashboard cards explaining integrations/workflows.
- Record short video:
  - explain Pepa use case
  - show dashboard
  - run the six demo prompts
  - explain webhooks/n8n/Supabase architecture
- Optional before deploy:
  - make repo public only if needed for submission
  - add screenshot or architecture diagram to README
