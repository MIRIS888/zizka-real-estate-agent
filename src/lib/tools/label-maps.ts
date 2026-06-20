const STATUS_LABELS_CS: Record<string, string> = {
  new: "Nový",
  contacted: "Kontaktován",
  qualified: "Kvalifikován",
  active: "Aktivní",
  inactive: "Neaktivní",
  won: "Uzavřeno",
  lost: "Ztracen",
  viewing_scheduled: "Prohlídka naplánována",
  open: "Otevřený",
  closed: "Uzavřený",
};

const SOURCE_LABELS_CS: Record<string, string> = {
  sreality: "Sreality",
  bezrealitky: "Bezrealitky",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "E-mail",
  referral: "Doporučení",
  web: "Web",
  phone: "Telefon",
  other: "Ostatní",
  unknown: "Neuvedeno",
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function localizeLabel(
  value: string | null | undefined,
  groupBy: string,
): string {
  if (!value) return "Neuvedeno";
  const lower = value.toLowerCase();
  if (groupBy === "status") return STATUS_LABELS_CS[lower] ?? titleCase(value);
  if (groupBy === "source") return SOURCE_LABELS_CS[lower] ?? titleCase(value);
  return value;
}
