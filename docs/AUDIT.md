# Audit Back Office Operations Agenta

## Aktualni stav

- Framework: Next.js 16, React 19, TypeScript, App Router.
- Frontend: jedna hlavni chat aplikace v `src/components/agent-chat.tsx`, Recharts pro grafy, Markdown rendering pro odpovedi.
- Backend: API route `POST /api/chat`; nove je pridane kompatibilni `POST /api/agent`.
- Data: Supabase migrace existuji, ale demo defaultne bezi nad lokalnimi deterministickymi seed daty v `src/lib/local-data/seed.ts`.
- AI vrstva: vsechny dotazy jdou pres Gemini planner; deterministicky agent zustava v repozitari, ale neni zapojeny v runtime.
- Integrace: Google Calendar/Gmail a Firecrawl jsou pripraveny jako volitelne live integrace. Bez env promenych se demo neopira o externi sluzby.

## Hlavni problemy pred upravou

- Demo zaviselo na LLM planovani a `GEMINI_API_KEY`, coz je rizikove pro vyberove rizeni.
- Seed data byla mala a neobsahovala explicitne vsechny entity ze zadani.
- Odpoved podporovala jen jeden artifact, takze jeden dotaz nemohl spolehlive vratit tabulku i vice grafu.
- Povinne scenare nebyly garantovane deterministickymi vystupy.
- Dokumentace nepopisovala jasne mockovane casti a presny demo postup.

## Nova architektura MVP

- Frontend: Next.js/React chat UI s prompt buttony pro 6 scenaru, tabulkami, grafy a sekci Generated outputs.
- Backend: `POST /api/agent` validuje vstup a vola sdilenou agent logiku.
- Datova vrstva: `DATA_SOURCE=local` pouziva seed data; `DATA_SOURCE=supabase` zustava pripravene pro produkcni napojeni.
- Agent tools: Gemini planner vybira z aplikačních tools pro analytiku, kvalitu dat, kalendar, e-maily, reporty a market watch.
- Reporty/exporty: odpovedi vraci tabulky, grafy a stazitelne CSV/Markdown/text soubory.
- Planovane ulohy: demo vytvari mock monitoring task; produkcne lze pouzit Vercel cron nebo n8n webhook.

## Priority

1. Udrzet Gemini planner instrukce presne tak, aby sest demo scenaru vybiralo spravne tools.
2. Pred odevzdanim spustit `npm run lint`, `npm run typecheck`, `npm run build`.
3. Pro video pouzit `DATA_SOURCE=local` a prompt buttony v UI.
4. Pokud se ma ukazovat live kalendar nebo scraping, doplnit Google/Firecrawl env promenne a jasne rict, ze jde o live integraci.
5. Produkcne presunout lokalni seed logiku do Supabase tabulek, pridat audit log tool volani a per-user opravneni.
