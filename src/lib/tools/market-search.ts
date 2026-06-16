import { getFirecrawlEnvironment, isFirecrawlConfigured } from "@/lib/env";
import { WatchMarketInputSchema } from "@/lib/contracts/tools";

type FirecrawlSearchResult = {
  url?: string;
  title?: string;
  description?: string;
};

type FirecrawlSearchResponse = {
  success?: boolean;
  data?:
    | FirecrawlSearchResult[]
    | {
        web?: FirecrawlSearchResult[];
      };
};

const REAL_ESTATE_DOMAINS = [
  "sreality.cz",
  "bezrealitky.cz",
  "reality.idnes.cz",
  "remax-czech.cz",
  "mmreality.cz",
];

function getSearchResults(payload: FirecrawlSearchResponse) {
  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload.data?.web ?? [];
}

export async function searchMarketListings(rawInput: unknown) {
  const input = WatchMarketInputSchema.parse(rawInput);

  if (!isFirecrawlConfigured()) {
    return {
      configured: false,
      query: input.locationQuery,
      listings: [],
    };
  }

  const environment = getFirecrawlEnvironment();
  const response = await fetch(`${environment.FIRECRAWL_API_URL}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment.FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${input.locationQuery} prodej byt dům nemovitost`,
      limit: 8,
      country: "CZ",
      includeDomains: REAL_ESTATE_DOMAINS,
      sources: [{ type: "web", location: "Czech Republic" }],
    }),
  });

  if (!response.ok) {
    throw new Error("Firecrawl market search failed.");
  }

  const payload = (await response.json()) as FirecrawlSearchResponse;
  const listings = getSearchResults(payload)
    .filter((result) => result.url && result.title)
    .map((result) => ({
      title: result.title ?? "",
      description: result.description ?? "",
      source: result.url ? new URL(result.url).hostname : "",
      url: result.url ?? "",
    }));

  return {
    configured: true,
    query: input.locationQuery,
    listings,
  };
}
