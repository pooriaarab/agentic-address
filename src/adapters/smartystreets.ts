import { AdapterError } from "./error.js";
import { fetchJson } from "./http.js";
import type {
  AdapterContext,
  AdapterOptions,
  AdapterResult,
  AddressInput,
  NormalizedAddress,
  VerifyAdapter,
  VerifySignals,
} from "./types.js";
import { clampScore, normalizePostal } from "../normalize.js";

interface SmartyCandidate {
  input_index?: number;
  delivery_line_1?: string;
  delivery_line_2?: string;
  last_line?: string;
  components?: {
    primary_number?: string;
    street_name?: string;
    street_suffix?: string;
    secondary_number?: string;
    secondary_designator?: string;
    city_name?: string;
    state_abbreviation?: string;
    zipcode?: string;
    plus4_code?: string;
  };
  metadata?: {
    residential?: boolean;
    vacant?: boolean;
  };
  analysis?: {
    dpv_match_code?: string;
    dpv_footnotes?: string;
    active?: string;
    footnotes?: string;
  };
}

function scoreCandidate(candidate: SmartyCandidate): VerifySignals {
  const notes: string[] = [];
  const match = candidate.analysis?.dpv_match_code ?? "";
  let score: number;
  switch (match) {
    case "Y":
      score = 95;
      break;
    case "S":
      score = 80;
      notes.push("secondary unit missing");
      break;
    case "D":
      score = 60;
      notes.push("default match");
      break;
    case "N":
      score = 15;
      notes.push("not deliverable");
      break;
    default:
      score = 40;
      notes.push("no DPV match code");
  }
  const footnotes = candidate.analysis?.dpv_footnotes ?? "";
  if (footnotes.includes("A1") || footnotes.includes("M1")) {
    score -= 10;
    notes.push(`DPV footnotes ${footnotes}`);
  }
  if (candidate.analysis?.active === "N") {
    score -= 20;
    notes.push("address not active");
  }
  const vacant = candidate.metadata?.vacant ?? null;
  if (vacant === true) {
    score -= 15;
    notes.push("premises vacant");
  }
  const finalScore = clampScore(score);
  return {
    deliverability:
      finalScore >= 80 ? "deliverable" : finalScore >= 50 ? "risky" : "undeliverable",
    score: finalScore,
    residential: candidate.metadata?.residential ?? null,
    vacant,
    notes,
  };
}

export class SmartyStreetsAdapter implements VerifyAdapter {
  readonly name = "smartystreets" as const;
  readonly needsKey = true;

  constructor(private options: AdapterOptions = {}) {}

  async verify(
    input: AddressInput,
    ctx: AdapterContext = {},
  ): Promise<AdapterResult> {
    const authId = this.options.authId;
    const authToken = this.options.apiKey;
    if (!authId?.trim() || !authToken?.trim()) {
      throw new AdapterError("smartystreets: missing API key");
    }
    const base = (
      this.options.baseUrl ?? "https://us-street.api.smarty.com"
    ).replace(/\/+$/, "");
    const params = new URLSearchParams({
      "auth-id": authId,
      "auth-token": authToken,
      street: input.street,
      city: input.city ?? "",
      state: input.state ?? "",
      zipcode: input.postal ?? "",
      match: "strict",
    });
    if (input.line2) params.set("secondary", input.line2);
    const data = (await fetchJson(
      this.name,
      `${base}/street-address?${params}`,
      undefined,
      { headers: { Accept: "application/json" } },
      ctx,
    )) as SmartyCandidate[];
    if (!Array.isArray(data) || data.length === 0) {
      throw new AdapterError("smartystreets: no candidates");
    }
    const best = data[0];
    const parts = [
      best.components?.primary_number,
      best.components?.street_name,
      best.components?.street_suffix,
    ].filter(Boolean);
    const normalized: NormalizedAddress = {
      street: (best.delivery_line_1 ?? parts.join(" ")).toUpperCase(),
      line2: (best.delivery_line_2 ?? "").toUpperCase(),
      city: (best.components?.city_name ?? input.city ?? "").toUpperCase(),
      state: (best.components?.state_abbreviation ?? input.state ?? "").toUpperCase(),
      postal: normalizePostal(
        best.components?.plus4_code
          ? `${best.components.zipcode}-${best.components.plus4_code}`
          : (best.components?.zipcode ?? input.postal),
      ),
      country: "US",
    };
    return { normalized, signals: scoreCandidate(best), vendorId: null };
  }
}
