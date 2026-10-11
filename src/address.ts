import {
  createGuards,
  createLogger,
  recordCost,
  VendorError,
  type Guards,
  type GuardsConfig,
  type Logger,
} from "agentic-core";
import { DryAdapter, LocalAdapter } from "./adapters/dry.js";
import { LobAdapter } from "./adapters/lob.js";
import { OsmAdapter } from "./adapters/osm.js";
import { PostGridAdapter } from "./adapters/postgrid.js";
import { SmartyStreetsAdapter } from "./adapters/smartystreets.js";
import type {
  AddressInput,
  AddressVendor,
  NormalizedAddress,
  VerifyAdapter,
  VerifySignals,
} from "./adapters/types.js";
import { normalizeAddress } from "./normalize.js";

export interface VerifyRequest extends AddressInput {
  vendor?: AddressVendor;
  live?: boolean;
  apiKey?: string;
  authId?: string;
  guards?: Guards;
  logger?: Logger;
  fetchFn?: typeof fetch;
  now?: () => Date;
}

export interface AddressReceipt {
  vendor: AddressVendor;
  normalized: NormalizedAddress;
  deliverability: VerifySignals["deliverability"];
  score: number;
  residential: boolean | null;
  vacant: boolean | null;
  notes: string[];
  vendorId: string | null;
  dryRun: boolean;
  at: string;
}

export function createAddressGuards(options: GuardsConfig = {}): Guards {
  return createGuards(options);
}

function buildAdapters(req: VerifyRequest): Record<AddressVendor, VerifyAdapter> {
  const options = {
    ...(req.apiKey ? { apiKey: req.apiKey } : {}),
    ...(req.authId ? { authId: req.authId } : {}),
  };
  return {
    dry: new DryAdapter(),
    local: new LocalAdapter(),
    smartystreets: new SmartyStreetsAdapter(options),
    lob: new LobAdapter(options),
    postgrid: new PostGridAdapter(options),
    osm: new OsmAdapter(),
  };
}

export async function verifyAddress(req: VerifyRequest): Promise<AddressReceipt> {
  if (typeof req.street !== "string" || req.street.trim().length === 0) {
    throw new VendorError("street is required");
  }
  const vendor = req.vendor ?? "dry";
  const adapters = buildAdapters(req);
  if (!Object.hasOwn(adapters, vendor)) {
    throw new VendorError("Unknown address vendor");
  }
  const text = [req.street, req.line2, req.city, req.state, req.postal]
    .filter(Boolean)
    .join(" ");
  const guards = req.guards ?? createAddressGuards({ now: req.now });
  guards.checkDispatch(text);
  const logger = req.logger ?? createLogger();
  const adapter = adapters[vendor];
  const dryRun = vendor === "dry" || (req.live !== true && adapter.needsKey);
  const runner = dryRun && vendor !== "dry" ? adapters.dry : adapter;
  let result;
  try {
    result = await runner.verify(req, {
      fetchFn: req.fetchFn,
      logger,
    });
  } catch (error) {
    if (error instanceof VendorError) throw error;
    throw new VendorError(`${vendor}: verification failed`, { cause: error });
  }
  if (dryRun) {
    logger.info(`Preview verify with ${vendor}`);
    return {
      vendor,
      normalized:
        vendor === "dry" ? result.normalized : normalizeAddress(req),
      deliverability: result.signals.deliverability,
      score: result.signals.score,
      residential: result.signals.residential,
      vacant: result.signals.vacant,
      notes:
        vendor === "dry"
          ? result.signals.notes
          : [`preview: ${vendor} was not called`, ...result.signals.notes],
      vendorId: null,
      dryRun: true,
      at: (req.now?.() ?? new Date()).toISOString(),
    };
  }
  if (adapter.needsKey) {
    guards.recordDispatch();
    recordCost({ kind: "dispatch", adapter: vendor, units: 1 });
  }
  logger.info(`Verified address with ${vendor}`);
  return {
    vendor,
    normalized: result.normalized,
    deliverability: result.signals.deliverability,
    score: result.signals.score,
    residential: result.signals.residential,
    vacant: result.signals.vacant,
    notes: result.signals.notes,
    vendorId: result.vendorId,
    dryRun: false,
    at: (req.now?.() ?? new Date()).toISOString(),
  };
}
