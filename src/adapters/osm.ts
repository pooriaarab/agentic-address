import { VendorError } from "agentic-core";
import { VERSION } from "../version.js";
import { fetchJson } from "./http.js";
import type {
  AdapterContext,
  AdapterResult,
  AddressInput,
  VerifyAdapter,
  VerifySignals,
} from "./types.js";
import { clampScore, normalizePostal } from "../normalize.js";

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
    const data = (await fetchJson(
      this.name,
      `https://nominatim.openstreetmap.org/search?${params}`,
      undefined,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": `agentic-address/${VERSION}`,
        },
      },
      ctx,
    )) as OsmPlace[];
    if (!Array.isArray(data) || data.length === 0) {
      throw new VendorError("osm: no match");
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
