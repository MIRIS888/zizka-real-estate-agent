export type ConfirmationIntent =
  | "pure_confirm"
  | "confirm_with_modification"
  | "confirm_with_additional_request"
  | "reject"
  | "question_or_unclear";

const CONFIRM_WORDS = [
  "ano", "ok", "jo", "jj", "jasne", "jasne", "souhlas", "souhlasim",
  "potvrzuji", "potvrdit", "super", "skvely", "skvele",
  "dobre", "dobra", "posli", "posli", "odesli", "odesli",
  "proved", "proved", "zaloz", "zaloz", "vytvor", "vytvor", "yes", "confirm",
];

// Rejection signals
const REJECT_WORDS = [
  "nechci", "nechce", "neposil", "nezakladej", "nezalozej",
  "neplanuji", "nezaplanuji", "stop", "storno", "cancel",
];

// Signals that the user is adding a NEW separate action on top of confirming
const ADDITIONAL_MARKERS = [
  "a zaroven", "a taky", "a take",
  "a jeste", "a navic",
  "a pridej", "a nastav i", "a posli i",
];

// Signals that the user is CHANGING the original pending action
const MODIFICATION_MARKERS = [
  " ale ", " ale,", ", ale ", ",ale ",
  "jenze", "jenomze",
  "a chci ", "a chtel ", "a chtela ",
  "kazdy den", "kazdy tyden",
  "kazde rano", "kazde odpoledne",
  "denne", "tydne",
  "pravidelne", "opakovane",
  "misto ", "namisto",
  "jindy", "jiny cas",
  " radsi ", " radeji ",
  " spis ", " spise ",
  "ne v ", "ne na ", "ne dnes ",
];

function normalizeCs(text: string): string {
  return text
    .toLocaleLowerCase("cs-CZ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function containsNorm(haystack: string, needle: string): boolean {
  return haystack.includes(normalizeCs(needle));
}

export function classifyConfirmationIntent(message: string): ConfirmationIntent {
  if (!message.trim()) return "question_or_unclear";

  const norm = normalizeCs(message);

  // Explicit question
  if (norm.includes("?")) return "question_or_unclear";

  const hasPositive = CONFIRM_WORDS.some((w) => containsNorm(norm, w));

  // Rejection: starts with "ne" word-boundary, or contains reject verbs without positive
  const isNegativeStart =
    norm === "ne" ||
    norm.startsWith("ne ") ||
    norm.startsWith("ne,") ||
    norm.startsWith("ne.") ||
    norm.startsWith("ne!");

  const hasRejectWord = REJECT_WORDS.some((w) => containsNorm(norm, w));

  if ((isNegativeStart || hasRejectWord) && !hasPositive) return "reject";

  if (!hasPositive) return "question_or_unclear";

  // Has positive — check for additional new request first
  if (ADDITIONAL_MARKERS.some((m) => containsNorm(norm, m))) {
    return "confirm_with_additional_request";
  }

  // Check for modification of the original action
  if (MODIFICATION_MARKERS.some((m) => containsNorm(norm, m))) {
    return "confirm_with_modification";
  }

  // "ok, v 22:15 mi pošli..." — positive word followed by a scheduling spec (time + action)
  // is a new compound request, not a pure confirmation of a pending action.
  const hasTimeSpec = /v\s+\d{1,2}:\d{2}/.test(norm);
  if (hasPositive && hasTimeSpec && norm.length > 30) {
    return "confirm_with_modification";
  }

  return "pure_confirm";
}
