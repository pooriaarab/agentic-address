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
import { normalizePostal } from "../normalize.js";

interface PostGridData {
  id?: string;
  status?: string;
  line1?: string;
  line2?: string;
  city?: string;
  provinceOrState?: string;
  postalOrZip?: string;
  countryCode?: string;
  residential?: boolean;
  vacant?: boolean;
}

interface PostGridResponse {
  status?: string;
  data?: PostGridData;
}

function scorePostGrid(status: string): VerifySignals {
  const notes = [`postgrid: ${status}`];
  let score: number;
  switch (status) {
    case "verified":
      score = 95;
      break;
    case "corrected":
      score = 85;
      break;
    case "partial":
      score = 60;
      break;
    case "failed":
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

export class PostGridAdapter implements VerifyAdapter {
  readonly name = "postgrid" as const;
  readonly needsKey = true;

  constructor(private options: AdapterOptions = {}) {}

  async verify(
    input: AddressInput,
    ctx: AdapterContext = {},
  ): Promise<AdapterResult> {
    const key = this.options.apiKey;
    if (!key?.trim()) throw new AdapterError("postgrid: missing API key");
    const base = (this.options.baseUrl ?? "https://api.postgrid.com").replace(
      /\/+$/,
      "",
    );
    const data = (await fetchJson(
      this.name,
      `${base}/print-mail/v1/addver/verifications`,
      undefined,
      {
        method: "POST",
        headers: {
          "x-api-key": key,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: {
          address: {
            line1: input.street,
            line2: input.line2 ?? "",
            city: input.city ?? "",
            provinceOrState: input.state ?? "",
            postalOrZip: input.postal ?? "",
            countryCode: (input.country ?? "US").toUpperCase(),
          },
        },
      },
      ctx,
    )) as PostGridResponse;
    const inner = data?.data;
    if (!inner || typeof inner !== "object" || !inner.status) {
      throw new AdapterError("postgrid: invalid response");
    }
    const signals = scorePostGrid(inner.status);
    signals.residential = inner.residential ?? null;
    signals.vacant = inner.vacant ?? null;
    return {
      normalized: {
        street: (inner.line1 ?? "").toUpperCase(),
        line2: (inner.line2 ?? "").toUpperCase(),
        city: (inner.city ?? "").toUpperCase(),
        state: (inner.provinceOrState ?? "").toUpperCase(),
        postal: normalizePostal(inner.postalOrZip),
        country: (inner.countryCode ?? "").toUpperCase(),
      },
      signals,
      vendorId: inner.id ?? null,
    };
  }
}
