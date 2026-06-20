import PptxGenJS from "pptxgenjs";
import { CreatePresentationInputSchema } from "@/lib/contracts/tools";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

const C_DARK = "1a365d";
const C_GOLD = "e8b84b";
const C_TEXT = "2d3748";
const C_WHITE = "FFFFFF";
const C_MUTED = "a0aec0";

type Slide = { title: string; bullets: string[] };

type PresentationResult = {
  fileName: string;
  downloadUrl: string;
  slides: Slide[];
};

function buildSlides(
  title: string,
  topic: string,
  audience: string | undefined,
  slideCount: number,
  sourceData?: { summary?: string; metrics?: Record<string, unknown> },
): Slide[] {
  const period = new Date().toLocaleDateString("cs-CZ", {
    month: "long",
    year: "numeric",
  });

  const slides: Slide[] = [];

  slides.push({
    title,
    bullets: [
      `Téma: ${topic}`,
      `Pro: ${audience ?? "Vedení"}`,
      `Období: ${period}`,
    ],
  });

  const metricBullets: string[] = [];
  if (sourceData?.metrics) {
    for (const [k, v] of Object.entries(sourceData.metrics).slice(0, 6)) {
      metricBullets.push(`${k}: ${String(v)}`);
    }
  }
  if (metricBullets.length === 0 && sourceData?.summary) {
    metricBullets.push(
      ...sourceData.summary
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 5),
    );
  }
  slides.push({
    title: "Klíčové výsledky",
    bullets:
      metricBullets.length > 0
        ? metricBullets
        : [
            "Data budou doplněna z interních systémů.",
            "Viz příloha: přehled za období.",
          ],
  });

  if (slideCount >= 3) {
    slides.push({
      title: "Doporučení a další kroky",
      bullets: [
        "Zkontrolovat neúplné záznamy nemovitostí",
        "Navázat kontakt s novými leady do 24 hodin",
        "Aktualizovat přehled aktivních nabídek",
        "Naplánovat týmovou schůzku k výsledkům",
      ],
    });
  }

  for (let i = 3; i < slideCount; i++) {
    slides.push({
      title: `Slide ${i + 1}`,
      bullets: ["Obsah bude doplněn."],
    });
  }

  return slides.slice(0, slideCount);
}

async function generateBuffer(title: string, slides: Slide[]): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  (pptx as { title?: string }).title = title;
  (pptx as { company?: string }).company = "Žižka Reality";

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const slide = pptx.addSlide();

    if (i === 0) {
      slide.background = { color: C_DARK };
      slide.addText(s.title, {
        x: 0.5,
        y: 1.0,
        w: 9,
        h: 1.6,
        fontSize: 36,
        bold: true,
        color: C_WHITE,
        align: "center",
        valign: "middle",
      });
      slide.addText(s.bullets.join("   ·   "), {
        x: 0.5,
        y: 2.8,
        w: 9,
        h: 0.7,
        fontSize: 13,
        color: "aec6df",
        align: "center",
      });
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
    } else {
      slide.background = { color: C_WHITE };
      slide.addText(s.title, {
        x: 0,
        y: 0,
        w: 10,
        h: 0.95,
        fontSize: 22,
        bold: true,
        color: C_WHITE,
        fill: { color: C_DARK },
        align: "left",
        valign: "middle",
        margin: [0, 0, 0, 20],
      });
      slide.addText(`${i + 1} / ${slides.length}`, {
        x: 8.5,
        y: 0.05,
        w: 1.3,
        h: 0.7,
        fontSize: 10,
        color: C_MUTED,
        align: "right",
      });

      const bulletItems = s.bullets.map((b) => ({
        text: b,
        options: {
          bullet: true,
          fontSize: 16 as number,
          color: C_TEXT,
          breakLine: true,
        },
      }));
      slide.addText(bulletItems, {
        x: 0.5,
        y: 1.15,
        w: 9,
        h: 3.85,
        valign: "top",
        paraSpaceAfter: 8,
      });

      slide.addText("Žižka Reality — Interní zpráva", {
        x: 0,
        y: 5.2,
        w: 10,
        h: 0.35,
        fontSize: 9,
        color: C_MUTED,
        align: "center",
      });
    }
  }

  return pptx.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}

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

  const buffer = await generateBuffer(input.title, slides);

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
        `Ujistěte se, že bucket 'generated-files' existuje v Supabase Storage — viz docs/STORAGE_SETUP.md.`,
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
