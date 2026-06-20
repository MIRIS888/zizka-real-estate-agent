import PptxGenJS from "pptxgenjs";
import { CreatePresentationInputSchema } from "@/lib/contracts/tools";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

// ── Brand colors ──────────────────────────────────────────────────────────────
const C_DARK    = "1a365d";
const C_NAVY_LT = "1e3a5f";
const C_GOLD    = "e8b84b";
const C_TEXT    = "2d3748";
const C_WHITE   = "FFFFFF";
const C_MUTED   = "718096";
const C_BLUE_LT = "aec6df";
const C_LIGHT   = "f0f4f8";
const C_BORDER  = "e2e8f0";

const PRIORITY_BG: Record<string, string> = {
  "Vysoká": "742a2a",
  "Střední": "744210",
  "Nízká":   "1a365d",
};
const PRIORITY_FG: Record<string, string> = {
  "Vysoká": "fed7d7",
  "Střední": "fefcbf",
  "Nízká":   "bee3f8",
};

// ── Guardrail ─────────────────────────────────────────────────────────────────
const FORBIDDEN_PHRASES = [
  "data budou doplněna",
  "viz příloha",
  "todo",
  "tbd",
  "doplnit později",
  "obsah bude doplněn",
  "bude doplněn",
  "data budou",
  "bude doplnena",
  "will be filled",
  "placeholder",
];

export type Slide = { title: string; bullets: string[] };

export type PresentationResult = {
  fileName: string;
  downloadUrl: string;
  slides: Slide[];
};

type KpiItem = { label: string; value: string };

type Recommendation = {
  text: string;
  priority: "Vysoká" | "Střední" | "Nízká";
};

type SourceData = {
  summary?: string;
  metrics?: Record<string, unknown>;
  period?: string;
};

// ── Guardrail helpers ─────────────────────────────────────────────────────────

function containsForbidden(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_PHRASES.some((p) => lower.includes(p));
}

function validatePresentation(slides: Slide[]): void {
  for (const slide of slides) {
    if (containsForbidden(slide.title)) {
      throw new Error(
        `Guardrail: Název slidu obsahuje zakázaný placeholder: "${slide.title}". ` +
        `Před generováním prezentace zavolej query_lead_metrics / query_client_metrics / find_incomplete_properties ` +
        `a předej výsledky do sourceData.metrics.`
      );
    }
    for (const bullet of slide.bullets) {
      if (containsForbidden(bullet)) {
        throw new Error(
          `Guardrail: Slide "${slide.title}" obsahuje zakázaný placeholder: "${bullet}". ` +
          `Prezentace vyžaduje konkrétní data z interních nástrojů.`
        );
      }
    }
  }

  const allText = slides.flatMap((s) => [s.title, ...s.bullets]).join(" ");
  if (!/\d+/.test(allText)) {
    throw new Error(
      `Guardrail: Prezentace neobsahuje žádné konkrétní metriky. ` +
      `Nejprve získej data (query_lead_metrics, query_client_metrics, query_sales_metrics, ` +
      `find_incomplete_properties) a předej je do sourceData.metrics.`
    );
  }
}

// ── Data extraction helpers ───────────────────────────────────────────────────

function extractKpis(metrics: Record<string, unknown> | undefined): KpiItem[] {
  if (!metrics) return [];
  return Object.entries(metrics)
    .filter(([, v]) => v !== undefined && v !== null)
    .slice(0, 4)
    .map(([k, v]) => ({ label: k, value: String(v) }));
}

function extractInsightBullets(
  metrics: Record<string, unknown> | undefined,
  summary: string | undefined,
): string[] {
  const bullets: string[] = [];

  if (summary) {
    const fromSummary = summary
      .split(/[.\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 10 && s.length < 200 && !containsForbidden(s))
      .slice(0, 4);
    bullets.push(...fromSummary);
  }

  if (bullets.length < 2 && metrics) {
    const fromMetrics = Object.entries(metrics)
      .slice(0, 5)
      .map(([k, v]) => `${k}: ${String(v)}`);
    bullets.push(...fromMetrics);
  }

  return bullets.slice(0, 5);
}

function buildRecommendations(
  metrics: Record<string, unknown> | undefined,
  topic: string,
): Recommendation[] {
  const recs: Recommendation[] = [];

  if (metrics) {
    const entries = Object.entries(metrics);

    const incompleteEntry = entries.find(([k]) =>
      /chybějíc|neúplné|incomplete|doplnit|bez rekonstrukce/i.test(k)
    );
    if (incompleteEntry && Number(incompleteEntry[1]) > 0) {
      recs.push({
        text: `Doplnit ${incompleteEntry[1]} záznamy s chybějícími údaji — blokuje inzerci`,
        priority: "Vysoká",
      });
    }

    const leadsEntry = entries.find(([k]) => /lead|poptávk/i.test(k));
    if (leadsEntry && Number(leadsEntry[1]) > 0) {
      recs.push({
        text: `Kontaktovat ${leadsEntry[1]} nových leadů do 24 hodin od záznamu`,
        priority: "Vysoká",
      });
    }

    const propertiesEntry = entries.find(([k]) => /nemovitost|aktivní|portfolio/i.test(k));
    if (propertiesEntry && Number(propertiesEntry[1]) > 0) {
      recs.push({
        text: `Aktualizovat ceny a dostupnost u ${propertiesEntry[1]} aktivních nabídek`,
        priority: "Střední",
      });
    }

    const clientsEntry = entries.find(([k]) => /klient/i.test(k));
    if (clientsEntry && Number(clientsEntry[1]) > 0) {
      recs.push({
        text: `Navázat follow-up s ${clientsEntry[1]} novými klienty — personalizovaná nabídka`,
        priority: "Střední",
      });
    }
  }

  if (recs.length === 0) {
    recs.push({ text: `Provést detailní analýzu výsledků: ${topic}`, priority: "Vysoká" });
  }
  if (recs.length < 2) {
    recs.push({
      text: "Naplánovat weekly review s týmem — sdílet data z interního systému",
      priority: "Střední",
    });
  }
  if (recs.length < 3) {
    recs.push({
      text: "Aktualizovat přehled aktivních nabídek do konce týdne",
      priority: "Nízká",
    });
  }

  return recs.slice(0, 3);
}

// ── Slide content builder (for chat preview) ──────────────────────────────────

export function buildSlides(
  title: string,
  topic: string,
  audience: string | undefined,
  slideCount: number,
  sourceData?: SourceData,
): Slide[] {
  const period =
    sourceData?.period ??
    new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });

  const kpis = extractKpis(sourceData?.metrics);
  const insightBullets = extractInsightBullets(sourceData?.metrics, sourceData?.summary);
  const recommendations = buildRecommendations(sourceData?.metrics, topic);

  const slides: Slide[] = [];

  slides.push({
    title,
    bullets: [
      `Období: ${period}`,
      `Pro: ${audience ?? "Vedení"}`,
      ...kpis.map((k) => `${k.label}: ${k.value}`),
    ],
  });

  slides.push({
    title: "Výsledky a pipeline",
    bullets:
      insightBullets.length > 0
        ? insightBullets
        : [`Téma: ${topic}`, `Přehled za: ${period}`],
  });

  if (slideCount >= 3) {
    slides.push({
      title: "Doporučení a další kroky",
      bullets: recommendations.map((r) => `[${r.priority}] ${r.text}`),
    });
  }

  for (let i = 3; i < slideCount; i++) {
    const extra = insightBullets.slice(0, 4);
    slides.push({
      title: `Detailní pohled: ${topic}`,
      bullets: extra.length > 0 ? extra : [`Pokračování analýzy: ${topic}`, `Období: ${period}`],
    });
  }

  return slides.slice(0, slideCount);
}

// ── PPTX rendering helpers ────────────────────────────────────────────────────

function addSlideHeader(
  slide: PptxGenJS.Slide,
  title: string,
  slideIndex: number,
  totalSlides: number,
): void {
  slide.addText(title, {
    x: 0,
    y: 0,
    w: 9.4,
    h: 0.9,
    fontSize: 21,
    bold: true,
    color: C_WHITE,
    fill: { color: C_DARK },
    align: "left",
    valign: "middle",
    margin: [0, 0, 0, 22],
  });
  slide.addText(`${slideIndex} / ${totalSlides}`, {
    x: 9.0,
    y: 0.1,
    w: 0.8,
    h: 0.65,
    fontSize: 10,
    color: C_MUTED,
    align: "right",
  });
}

function addSlideFooter(slide: PptxGenJS.Slide): void {
  slide.addText("Žižka Reality — Interní zpráva | Důvěrné", {
    x: 0,
    y: 5.2,
    w: 10,
    h: 0.35,
    fontSize: 9,
    color: C_MUTED,
    align: "center",
  });
}

function addKpiGrid(slide: PptxGenJS.Slide, kpis: KpiItem[]): void {
  const count = Math.min(kpis.length, 4);
  const colW = 9.0 / count;

  const valueRow: PptxGenJS.TableCell[] = kpis.slice(0, count).map((k) => ({
    text: k.value,
    options: {
      fontSize: 30,
      bold: true,
      color: C_GOLD,
      align: "center",
      valign: "bottom",
      fill: { color: C_NAVY_LT },
      border: [
        { pt: 0, color: C_NAVY_LT },
        { pt: 1, color: C_DARK },
        { pt: 0, color: C_NAVY_LT },
        { pt: 1, color: C_DARK },
      ],
    },
  }));

  const labelRow: PptxGenJS.TableCell[] = kpis.slice(0, count).map((k) => ({
    text: k.label,
    options: {
      fontSize: 11,
      color: C_BLUE_LT,
      align: "center",
      valign: "top",
      fill: { color: C_NAVY_LT },
      border: [
        { pt: 0, color: C_NAVY_LT },
        { pt: 1, color: C_DARK },
        { pt: 1, color: C_DARK },
        { pt: 1, color: C_DARK },
      ],
    },
  }));

  slide.addTable([valueRow, labelRow], {
    x: 0.5,
    y: 2.5,
    w: 9.0,
    h: 1.85,
    colW: Array(count).fill(colW) as number[],
    rowH: [1.1, 0.65],
  });
}

function addBulletSection(slide: PptxGenJS.Slide, bullets: string[], yStart = 1.1): void {
  const bulletItems = bullets.map((b) => ({
    text: b,
    options: {
      bullet: true,
      fontSize: 16 as number,
      color: C_TEXT,
      breakLine: true,
    },
  }));
  slide.addText(bulletItems, {
    x: 0.55,
    y: yStart,
    w: 8.9,
    h: 4.05 - (yStart - 1.1),
    valign: "top",
    paraSpaceAfter: 8,
  });
}

function addMetricsTable(slide: PptxGenJS.Slide, metrics: Record<string, unknown>): void {
  const entries = Object.entries(metrics).slice(0, 7);
  if (entries.length === 0) return;

  const headerRow: PptxGenJS.TableCell[] = [
    {
      text: "Metrika",
      options: {
        fontSize: 13,
        bold: true,
        color: C_WHITE,
        fill: { color: C_DARK },
        align: "left",
        margin: [0, 0, 0, 8],
      },
    },
    {
      text: "Hodnota",
      options: {
        fontSize: 13,
        bold: true,
        color: C_WHITE,
        fill: { color: C_DARK },
        align: "center",
      },
    },
  ];

  const dataRows: PptxGenJS.TableRow[] = entries.map(([k, v], idx) => [
    {
      text: k,
      options: {
        fontSize: 13,
        color: C_TEXT,
        fill: { color: idx % 2 === 0 ? C_WHITE : C_LIGHT },
        align: "left",
        margin: [0, 0, 0, 8],
      },
    },
    {
      text: String(v ?? "–"),
      options: {
        fontSize: 14,
        bold: true,
        color: C_DARK,
        fill: { color: idx % 2 === 0 ? C_WHITE : C_LIGHT },
        align: "center",
      },
    },
  ]);

  slide.addTable([headerRow, ...dataRows], {
    x: 0.55,
    y: 1.1,
    w: 8.9,
    h: (entries.length + 1) * 0.52,
    colW: [6.5, 2.4],
    rowH: 0.52,
    border: { type: "solid", pt: 1, color: C_BORDER },
  });
}

function addRecommendationsContent(slide: PptxGenJS.Slide, recs: Recommendation[]): void {
  recs.forEach((rec, i) => {
    const y = 1.1 + i * 1.28;
    const bgColor = PRIORITY_BG[rec.priority] ?? C_DARK;
    const fgColor = PRIORITY_FG[rec.priority] ?? C_WHITE;

    slide.addText(rec.priority, {
      x: 0.55,
      y,
      w: 1.4,
      h: 0.38,
      fontSize: 11,
      bold: true,
      color: fgColor,
      fill: { color: bgColor },
      align: "center",
      valign: "middle",
    });

    slide.addText(rec.text, {
      x: 2.1,
      y,
      w: 7.5,
      h: 0.95,
      fontSize: 15,
      color: C_TEXT,
      valign: "top",
      wrap: true,
    });
  });
}

// ── PPTX buffer generator ─────────────────────────────────────────────────────

async function generateBuffer(
  title: string,
  slides: Slide[],
  sourceData?: SourceData,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  (pptx as { title?: string }).title = title;
  (pptx as { company?: string }).company = "Žižka Reality";

  const kpis = extractKpis(sourceData?.metrics);
  const topic = slides[0]?.title ?? title;
  const recommendations = buildRecommendations(sourceData?.metrics, topic);

  const period =
    sourceData?.period ??
    new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const slide = pptx.addSlide();

    if (i === 0) {
      // ── Title + KPI grid ──────────────────────────────────────────────────
      slide.background = { color: C_DARK };

      slide.addText(s.title, {
        x: 0.5,
        y: 0.55,
        w: 9,
        h: 1.5,
        fontSize: 36,
        bold: true,
        color: C_WHITE,
        align: "center",
        valign: "middle",
      });

      slide.addText(period, {
        x: 0.5,
        y: 2.05,
        w: 9,
        h: 0.42,
        fontSize: 13,
        color: C_BLUE_LT,
        align: "center",
      });

      if (kpis.length > 0) {
        addKpiGrid(slide, kpis);
      } else {
        slide.addText(s.bullets.slice(2).join("   ·   "), {
          x: 0.5,
          y: 2.55,
          w: 9,
          h: 0.7,
          fontSize: 13,
          color: C_BLUE_LT,
          align: "center",
        });
      }

      slide.addText("Žižka Reality", {
        x: 0,
        y: 5.1,
        w: 10,
        h: 0.4,
        fontSize: 10,
        color: C_GOLD,
        align: "center",
        bold: true,
      });
    } else if (i === 1) {
      // ── Pipeline / results slide ──────────────────────────────────────────
      slide.background = { color: C_WHITE };
      addSlideHeader(slide, s.title, i + 1, slides.length);

      if (sourceData?.metrics && Object.keys(sourceData.metrics).length > 0) {
        addMetricsTable(slide, sourceData.metrics);
      } else {
        addBulletSection(slide, s.bullets);
      }

      addSlideFooter(slide);
    } else if (i === 2) {
      // ── Recommendations slide ─────────────────────────────────────────────
      slide.background = { color: C_WHITE };
      addSlideHeader(slide, s.title, i + 1, slides.length);
      addRecommendationsContent(slide, recommendations);
      addSlideFooter(slide);
    } else {
      // ── Additional slides ─────────────────────────────────────────────────
      slide.background = { color: C_WHITE };
      addSlideHeader(slide, s.title, i + 1, slides.length);
      addBulletSection(slide, s.bullets);
      addSlideFooter(slide);
    }
  }

  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function createPresentation(
  rawInput: unknown,
  options?: { userId?: string; threadId?: string },
): Promise<PresentationResult> {
  const input = CreatePresentationInputSchema.parse(rawInput);
  const slideCount = input.slideCount ?? 3;

  const slides = buildSlides(
    input.title,
    input.topic,
    input.audience,
    slideCount,
    input.sourceData,
  );

  validatePresentation(slides);

  const buffer = await generateBuffer(input.title, slides, input.sourceData);

  const timestamp = Date.now();
  const userId = options?.userId ?? "anon";
  const threadId = options?.threadId ?? "unknown";
  const fileName = `${timestamp}-report.pptx`;
  const filePath = `presentations/${userId}/${threadId}/${fileName}`;
  const mimeType =
    "application/vnd.openxmlformats-officedocument.presentationml.presentation";

  const supabase = createSupabaseServiceClient();

  const { error: uploadError } = await supabase.storage
    .from("generated-files")
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    throw new Error(
      `Nepodařilo se nahrát prezentaci: ${uploadError.message}. ` +
        `Ujistěte se, že bucket 'generated-files' existuje v Supabase Storage (viz docs/STORAGE_SETUP.md).`,
    );
  }

  const { data: signed, error: signError } = await supabase.storage
    .from("generated-files")
    .createSignedUrl(filePath, 60 * 60);

  if (signError || !signed?.signedUrl) {
    throw new Error(
      `Prezentace nahrána, ale nepodařilo se vygenerovat odkaz ke stažení: ${signError?.message ?? "neznámá chyba"}`,
    );
  }

  return { fileName, downloadUrl: signed.signedUrl, slides };
}
