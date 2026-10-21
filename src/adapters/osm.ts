import { AdapterError } from "./error.js";
import { fetchJson } from "./http.js";
import type {
  AdapterContext,
  AdapterOptions,
  AdapterResult,
  AddressInput,
  VerifyAdapter,
  VerifySignals,
} from "./types.js";
import { clampScore, normalizePostal } from "../normalize.js";

// version.ts reads package.json through node:module, so this adapter
// keeps its own version string: the tsup define bakes the real one in
// and source runs fall back to "dev". No node import on this path.
declare const __PACK_VERSION__: string | undefined;
const USER_AGENT = `agentic-address/${
  typeof __PACK_VERSION__ === "string" ? __PACK_VERSION__ : "dev"
}`;

interface OsmPlace {
  display_name?: string;
  importance?: number;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
}

export class OsmAdapter implements VerifyAdapter {
  readonly name = "osm" as const;
  readonly needsKey = false;

  constructor(private options: AdapterOptions = {}) {}

  async verify(
    input: AddressInput,
    ctx: AdapterContext = {},
  ): Promise<AdapterResult> {
    const query = [
      input.street,
      input.line2,
      input.city,
      input.state,
      input.postal,
      input.country,
    ]
      .filter((part) => part && part.trim())
      .join(", ");
    const params = new URLSearchParams({
      format: "jsonv2",
      q: query,
      addressdetails: "1",
      limit: "1",
    });
    const base = (
      this.options.baseUrl ?? "https://nominatim.openstreetmap.org"
    ).replace(/\/+$/, "");
    const data = (await fetchJson(
      this.name,
      `${base}/search?${params}`,
      undefined,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      },
      ctx,
    )) as OsmPlace[];
    if (!Array.isArray(data) || data.length === 0) {
      throw new AdapterError("osm: no match");
    }
    const place = data[0];
    const details = place.address ?? {};
    const importance =
      typeof place.importance === "number" ? place.importance : 0;
    const score = clampScore(45 + importance * 60);
    const signals: VerifySignals = {
      deliverability:
        score >= 80 ? "deliverable" : score >= 50 ? "risky" : "undeliverable",
      score,
      residential: null,
      vacant: null,
      notes: [`osm: ${place.display_name ?? "match"}`],
    };
    const street = [details.house_number, details.road]
      .filter(Boolean)
      .join(" ");
    return {
      normalized: {
        street: (street || input.street).toUpperCase(),
        line2: (input.line2 ?? "").toUpperCase(),
        city: (details.city ?? details.town ?? details.village ?? input.city ?? "").toUpperCase(),
        state: (details.state ?? input.state ?? "").toUpperCase(),
        postal: normalizePostal(details.postcode ?? input.postal),
        country: (details.country_code ?? input.country ?? "").toUpperCase(),
      },
      signals,
      vendorId: null,
    };
  }
}
