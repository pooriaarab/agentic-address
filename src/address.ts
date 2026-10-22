import { createLogger, recordCost } from "agentic-core";
import { DryAdapter, LocalAdapter } from "./adapters/dry.js";
import { LobAdapter } from "./adapters/lob.js";
import { OsmAdapter } from "./adapters/osm.js";
import { PostGridAdapter } from "./adapters/postgrid.js";
import { SmartyStreetsAdapter } from "./adapters/smartystreets.js";
import type { AddressVendor, VerifyAdapter } from "./adapters/types.js";
import { runVerify, type VerifyRequest } from "./verify-core.js";
import type { AddressReceipt } from "./verify-core.js";

export { runVerify, createAddressGuards } from "./verify-core.js";
export type {
  AddressReceipt,
  VerifyRequest,
} from "./verify-core.js";

// Keyed adapters take credentials through AdapterOptions only. The
// env fallback lives here so the adapter modules stay fetch-only and
// bundle for Cloudflare Workers through the /adapters entry point.
function buildAdapters(req: VerifyRequest): Record<AddressVendor, VerifyAdapter> {
  return {
    dry: new DryAdapter(),
    local: new LocalAdapter(),
    smartystreets: new SmartyStreetsAdapter({
      authId: req.authId ?? process.env.SMARTYSTREETS_AUTH_ID,
      apiKey: req.apiKey ?? process.env.SMARTYSTREETS_AUTH_TOKEN,
    }),
    lob: new LobAdapter({ apiKey: req.apiKey ?? process.env.LOB_API_KEY }),
    postgrid: new PostGridAdapter({
      apiKey: req.apiKey ?? process.env.POSTGRID_ADDVER_API_KEY,
    }),
    osm: new OsmAdapter(),
  };
}

export async function verifyAddress(
  req: VerifyRequest,
): Promise<AddressReceipt> {
  // Node entry point: keep the env fallbacks above plus the core stderr
  // logger and the session cost ledger. The /adapters entry injects
  // nothing, so its defaults stay a no-op logger and no cost sink.
  return runVerify(
    {
      ...req,
      logger: req.logger ?? createLogger(),
      onCost: req.onCost ?? recordCost,
    },
    buildAdapters(req),
  );
}
