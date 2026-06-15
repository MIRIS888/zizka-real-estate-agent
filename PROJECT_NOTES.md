# Project Notes

## Current State

- Project: Back Office Operations Agent for a real estate operations/back-office use case.
- Goal: demo for Saturday, then deploy to Vercel and record short demo video.
- GitHub repo: https://github.com/MIRIS888/zizka-real-estate-agent
- Repo visibility: private.
- Main branch: `main`, tracking `origin/main`.

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
- `src/app/api/webhooks/n8n/leads/route.ts` - lead webhook route.
- `src/app/api/chat/route.ts` - chat API route.
- `README.md` - setup and demo prompts.

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
- Real Gmail/Outlook/Google Calendar/real-estate portal integrations are represented by demo data and webhook architecture for now.
- Browser hydration warning came from an external browser attribute on `<html>`; `suppressHydrationWarning` was added in `src/app/layout.tsx`.
- `gh` CLI is authenticated as `MIRIS888` outside the sandbox.

## Next Steps

- Run the app locally and inspect the UI visually.
- Improve Czech copy and make the demo outputs look polished.
- Add clearer dashboard cards explaining integrations/workflows.
- Prepare Vercel deployment:
  - connect GitHub repo
  - set env vars
  - deploy
- Record short video:
  - explain Pepa use case
  - show dashboard
  - run the six demo prompts
  - explain webhooks/n8n/Supabase architecture
- Optional before deploy:
  - make repo public only if needed for submission
  - add screenshot or architecture diagram to README
