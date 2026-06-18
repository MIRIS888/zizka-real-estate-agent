const baseUrl = process.env.DEMO_BASE_URL ?? "http://127.0.0.1:3000";

const prompts = [
  "Jaké nové klienty máme za 1. kvartál? Odkud přišli? Můžeš to znázornit graficky?",
  "Vytvoř graf vývoje počtu leadů a prodaných nemovitostí za posledních 6 měsíců.",
  "Napiš e-mail pro zájemce o moji nemovitost a doporuč mu termín prohlídky na základě mé dostupnosti v kalendáři.",
  "Najdi nemovitosti, u kterých nám v systému chybí data o rekonstrukci a stavebních úpravách a připrav jejich seznam k doplnění.",
  "Shrň výsledky minulého týdne do krátkého reportu pro vedení a připrav k tomu prezentaci se třemi slidy.",
  "Sleduj všechny hlavní realitní servery a každé ráno mě informuj o nových nabídkách v lokalitě Praha Holešovice.",
];

async function validatePrompt(prompt, index) {
  const response = await fetch(`${baseUrl}/api/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: prompt }),
  });

  if (!response.ok) {
    throw new Error(`Prompt ${index + 1} failed with HTTP ${response.status}`);
  }

  const payload = await response.json();

  if (!payload.message || !payload.intent) {
    throw new Error(`Prompt ${index + 1} returned an invalid payload`);
  }

  if (!payload.artifact && !payload.artifacts && !payload.emailDraft) {
    throw new Error(`Prompt ${index + 1} returned no demo output`);
  }

  console.log(`OK ${index + 1}: ${payload.intent}`);
}

try {
  for (const [index, prompt] of prompts.entries()) {
    await validatePrompt(prompt, index);
  }
  console.log("All demo prompts passed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  console.error(`Start the app first, for example: npm run dev -- -p 3000`);
  process.exit(1);
}
