import { AdapterError } from "./adapters/error.js";
import { DryAdapter, LocalAdapter } from "./adapters/dry.js";
import { LobAdapter } from "./adapters/lob.js";
import { OsmAdapter } from "./adapters/osm.js";
import { PostGridAdapter } from "./adapters/postgrid.js";
import { SmartyStreetsAdapter } from "./adapters/smartystreets.js";
import type { AddressVendor, VerifyAdapter } from "./adapters/types.js";
import { runVerify } from "./verify-core.js";
import type { AddressReceipt, VerifyRequest } from "./verify-core.js";

// Fetch-only entry point for Cloudflare Workers and other hosts with
// no filesystem and no process.env. `import { verifyAddress } from
// "agentic-address/adapters"` takes every credential as an argument;
// nothing is read from the environment. The SDK, CLI, and MCP entry
// points keep their env fallbacks in ./address.js.

export { DryAdapter, LocalAdapter } from "./adapters/dry.js";
export { LobAdapter } from "./adapters/lob.js";
export { OsmAdapter } from "./adapters/osm.js";
export { PostGridAdapter } from "./adapters/postgrid.js";
export { SmartyStreetsAdapter } from "./adapters/smartystreets.js";
export { basicAuth, fetchJson } from "./adapters/http.js";
export type { FetchOptions } from "./adapters/http.js";
export type {
  AdapterContext,
  AdapterOptions,
  AdapterResult,
  AddressInput,
  AddressVendor,
  Logger,
  NormalizedAddress,
  VerifyAdapter,
  VerifySignals,
} from "./adapters/types.js";
export { runVerify, createAddressGuards, createGuards } from "./verify-core.js";
export type {
  AddressReceipt,
  CostRecord,
  Guards,
  GuardsConfig,
  VerifyRequest,
} from "./verify-core.js";
export { normalizeAddress } from "./normalize.js";
export { AdapterError, GuardError } from "./adapters/error.js";

export interface WorkersVerifyRequest extends VerifyRequest {
  baseUrl?: string;
}

// Keyed adapters built from arguments alone. baseUrl points a vendor
// at a local fake for E2E runs; production callers leave it unset.
export function buildAdapters(
  req: WorkersVerifyRequest = { street: "" },
): Record<AddressVendor, VerifyAdapter> {
  const options = {
    ...(req.apiKey ? { apiKey: req.apiKey } : {}),
    ...(req.authId ? { authId: req.authId } : {}),
    ...(req.baseUrl ? { baseUrl: req.baseUrl } : {}),
  };
  return {
    dry: new DryAdapter(),
    local: new LocalAdapter(),
    smartystreets: new SmartyStreetsAdapter(options),
    lob: new LobAdapter(options),
    postgrid: new PostGridAdapter(options),
    osm: new OsmAdapter(options),
  };
}

// On this path a verify either calls the vendor or refuses. It never
// returns a local score dressed as a verdict: a non-dry vendor without
// `live: true` throws (a key is required too, enforced by the adapter),
// "local" heuristic scoring is not offered here, and an explicit "dry"
// preview reports deliverability "unknown" so it cannot read as
// deliverable downstream.
export async function verifyAddress(
  req: WorkersVerifyRequest,
): Promise<AddressReceipt> {
  const adapters = buildAdapters(req);
  const vendor = req.vendor ?? "dry";
  if (vendor === "local") {
    throw new AdapterError(
      'vendor "local" is a heuristic score, not a verification: use a keyed vendor with live: true, or "dry" for a preview',
    );
  }
  if (
    vendor !== "dry" &&
    Object.hasOwn(adapters, vendor) &&
    req.live !== true
  ) {
    throw new AdapterError(
      `verify with vendor "${vendor}" on the adapters path needs live: true and the vendor key; use vendor "dry" for a preview`,
    );
  }
  const receipt = await runVerify(req, adapters);
  return receipt.dryRun ? { ...receipt, deliverability: "unknown" } : receipt;
}
