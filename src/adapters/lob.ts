import { AdapterError } from "./error.js";
import { basicAuth, fetchJson } from "./http.js";
import type {
  AdapterContext,
  AdapterOptions,
  AdapterResult,
  AddressInput,
  VerifyAdapter,
  VerifySignals,
} from "./types.js";
import { normalizePostal } from "../normalize.js";

interface LobComponents {
  primary_number?: string;
  street_name?: string;
  street_suffix?: string;
  secondary_designator?: string;
  secondary_number?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  zip_code_plus_4?: string;
}

interface LobResponse {
  id?: string;
  deliverability?: string;
  components?: LobComponents;
}

function scoreLob(deliverability: string): VerifySignals {
  const notes = [`lob: ${deliverability}`];
  let score: number;
  switch (deliverability) {
    case "deliverable":
      score = 95;
      break;
    case "deliverable_missing_unit":
      score = 80;
      break;
    case "deliverable_unnecessary_unit":
      score = 85;
      break;
    case "undeliverable":
      score = 15;
      break;
    default:
      score = 40;
  }
  return {
    deliverability:
      score >= 80 ? "deliverable" : score >= 50 ? "risky" : "undeliverable",
    score,
    residential: null,
    vacant: null,
    notes,
  };
}

export class LobAdapter implements VerifyAdapter {
  readonly name = "lob" as const;
  readonly needsKey = true;

  constructor(private options: AdapterOptions = {}) {}

  async verify(
    input: AddressInput,
    ctx: AdapterContext = {},
  ): Promise<AdapterResult> {
    const key = this.options.apiKey;
    if (!key?.trim()) throw new AdapterError("lob: missing API key");
    const base = (this.options.baseUrl ?? "https://api.lob.com").replace(
      /\/+$/,
      "",
    );
    const data = (await fetchJson(
      this.name,
      `${base}/v1/us_verifications`,
      undefined,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(key),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: {
          primary_line: input.street,
          secondary_line: input.line2 ?? "",
          city: input.city ?? "",
          state: input.state ?? "",
          zip_code: input.postal ?? "",
        },
      },
      ctx,
    )) as LobResponse;
    if (!data || typeof data !== "object" || !data.deliverability) {
      throw new AdapterError("lob: invalid response");
    }
    const parts = [
      data.components?.primary_number,
      data.components?.street_name,
      data.components?.street_suffix,
    ].filter(Boolean);
    return {
      normalized: {
        street: parts.join(" ").toUpperCase(),
        line2: [data.components?.secondary_designator, data.components?.secondary_number]
          .filter(Boolean)
          .join(" ")
          .toUpperCase(),
        city: (data.components?.city ?? "").toUpperCase(),
        state: (data.components?.state ?? "").toUpperCase(),
        postal: normalizePostal(
          data.components?.zip_code_plus_4
            ? `${data.components.zip_code}-${data.components.zip_code_plus_4}`
            : data.components?.zip_code,
        ),
        country: "US",
      },
      signals: scoreLob(data.deliverability),
      vendorId: data.id ?? null,
    };
  }
}
