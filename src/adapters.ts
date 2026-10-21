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
  NormalizedAddress,
  VerifyAdapter,
  VerifySignals,
} from "./adapters/types.js";
export { runVerify, createAddressGuards } from "./verify-core.js";
export type { AddressReceipt, VerifyRequest } from "./verify-core.js";
export { normalizeAddress } from "./normalize.js";
export { VendorError } from "agentic-core";

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

export async function verifyAddress(
  req: WorkersVerifyRequest,
): Promise<AddressReceipt> {
  return runVerify(req, buildAdapters(req));
}
