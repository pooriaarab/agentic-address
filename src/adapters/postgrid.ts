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
  country?: string;
  errors?: Record<string, string[]>;
  residential?: boolean;
  vacant?: boolean;
}

interface PostGridResponse {
  status?: string;
  data?: PostGridData;
}

// PostGrid Address Verification documents three verdicts on data.status:
// "verified" is deliverable as-is, "corrected" was fixed and is deliverable
// (errors says what changed), "failed" could not be fixed. A status the docs
// do not name is judged by the errors object: named field problems make the
// address undeliverable, while an unexplained verdict reads only as risky.
function scorePostGrid(
  status: string,
  errors: Record<string, string[]> | undefined,
): VerifySignals {
  const problems = Object.entries(errors ?? {}).flatMap(([field, list]) =>
    (Array.isArray(list) ? list : []).map((msg) => `${field}: ${msg}`),
  );
  const notes = [`postgrid: ${status}`, ...problems];
  let score: number;
  switch (status) {
    case "verified":
      score = 95;
      break;
    case "corrected":
      score = 85;
      break;
    case "failed":
      score = 15;
      break;
    default:
      score = problems.length > 0 ? 30 : 55;
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
    // Address Verification is its own PostGrid product on
    // api.postgrid.com/v1/addver with its own key set; it never lived
    // under /print-mail/v1. The body field is "country" ("ca" or "us").
    const data = (await fetchJson(
      this.name,
      `${base}/v1/addver/verifications`,
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
            country: (input.country ?? "US").toLowerCase(),
          },
        },
      },
      ctx,
    )) as PostGridResponse;
    const inner = data?.data;
    if (!inner || typeof inner !== "object" || !inner.status) {
      throw new AdapterError("postgrid: invalid response");
    }
    const signals = scorePostGrid(inner.status, inner.errors);
    signals.residential = inner.residential ?? null;
    signals.vacant = inner.vacant ?? null;
    return {
      normalized: {
        street: (inner.line1 ?? "").toUpperCase(),
        line2: (inner.line2 ?? "").toUpperCase(),
        city: (inner.city ?? "").toUpperCase(),
        state: (inner.provinceOrState ?? "").toUpperCase(),
        postal: normalizePostal(inner.postalOrZip),
        country: (inner.country ?? "").toUpperCase(),
      },
      signals,
      vendorId: inner.id ?? null,
    };
  }
}
