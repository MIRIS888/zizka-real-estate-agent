# Zizka Real Estate Operations Agent

An AI-assisted back-office application for real estate operations. The
application uses Next.js for the user interface and API, Gemini for language
model capabilities, Supabase for data and authentication, and n8n Cloud for
scheduled workflows.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add a Gemini API key.
4. Run `npm run dev`.

The dashboard is available without external credentials. Chat requests require
`GEMINI_API_KEY`. By default, `DATA_SOURCE=local` uses in-memory seed data for
lead analytics and property data-quality checks, so Supabase is not required for
the first local test.

Example local `.env.local`:

```bash
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-2.5-flash
DATA_SOURCE=local
N8N_WEBHOOK_SECRET=replace-with-a-long-local-secret-value
```

Try these local chat prompts:

- `Ukaž vývoj počtu leadů za posledních 6 měsíců.`
- `Odkud přišli noví klienti za první kvartál?`
- `Najdi nemovitosti, kde chybí data o rekonstrukci a stavebních úpravách.`

Demo prompts matching the assignment:

- `Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?`
- `Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.`
- `Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.`
- `Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.`
- `Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.`
- `Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.`

## Architecture boundaries

- Next.js owns the user interface, authorization checks, and synchronous API.
- Gemini selects from application-defined operations and produces structured
  responses. It never receives unrestricted database access.
- Supabase stores business data, workflow state, and audit records.
- n8n Cloud runs schedules and external integration workflows through signed
  webhooks.

## Lead intake webhook

External systems can create leads through:

```text
POST /api/webhooks/n8n/leads
Authorization: Bearer <N8N_WEBHOOK_SECRET>
Content-Type: application/json
```

Example payload:

```json
{
  "source": "email",
  "contact": {
    "fullName": "Jan Novak",
    "email": "jan@example.com",
    "phone": "+420777123456"
  },
  "message": "Dobry den, zajima me byt 3+kk v Praze.",
  "propertyReference": "Praha 3, 3+kk",
  "receivedAt": "2026-06-15T19:30:00.000Z"
}
```

In local mode the webhook validates the payload but does not write to a
database. Set `DATA_SOURCE=supabase` and configure Supabase environment
variables to store leads in `clients` and `leads`.
