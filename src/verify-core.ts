import { AdapterError, GuardError } from "./adapters/error.js";
import type {
  AddressInput,
  AddressVendor,
  Logger,
  NormalizedAddress,
  VerifyAdapter,
  VerifySignals,
} from "./adapters/types.js";
import { normalizeAddress } from "./normalize.js";

// Host-neutral verify core. This module never reads process.env, never
// touches the filesystem, and never imports agentic-core, so the
// /adapters entry point can serve Cloudflare Workers. Credentials reach
// adapters through AdapterOptions; logging and cost records reach the
// caller through injected hooks. The default logger is a no-op, and no
// cost is reported unless the caller passes `onCost`.

export interface CapsConfig {
  maxDispatches?: number;
}

export interface QuietHoursConfig {
  startHour?: number;
  endHour?: number;
}

export interface GuardsConfig {
  caps?: CapsConfig;
  quietHours?: QuietHoursConfig;
  blocklist?: string[];
  now?: () => Date;
}

export interface Guards {
  readonly dispatchCount: number;
  checkDispatch(text: string): void;
  recordDispatch(): void;
}

export interface CostRecord {
  kind: string;
  adapter: string;
  units: number;
  at: string;
}

function assertHour(value: number | undefined, label: string): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0 || value > 24) {
    throw new Error(`${label} must be an integer from 0 to 24`);
  }
}

// Dispatch guards identical in behaviour to agentic-core's createGuards,
// re-implemented here so this module needs no import from the core
// entry. Denials throw GuardError.
export function createGuards(config: GuardsConfig = {}): Guards {
  const maxDispatches = config.caps?.maxDispatches;
  if (
    maxDispatches !== undefined &&
    (!Number.isInteger(maxDispatches) || maxDispatches < 0)
  ) {
    throw new Error("caps.maxDispatches must be an integer of 0 or more");
  }
  const startHour = config.quietHours?.startHour;
  const endHour = config.quietHours?.endHour;
  assertHour(startHour, "quietHours.startHour");
  assertHour(endHour, "quietHours.endHour");
  const blocklist = (config.blocklist ?? []).map((term) =>
    term.toLowerCase(),
  );
  const now = config.now ?? (() => new Date());
  let count = 0;
  const inQuietHours = (date: Date): boolean => {
    if (startHour === undefined || endHour === undefined) return false;
    const hour = date.getUTCHours();
    if (startHour <= endHour) {
      return hour >= startHour && hour < endHour;
    }
    return hour >= startHour || hour < endHour;
  };
  return {
    get dispatchCount() {
      return count;
    },
    checkDispatch(text) {
      if (maxDispatches !== undefined && count >= maxDispatches) {
        throw new GuardError(
          `dispatch cap reached (${maxDispatches} of ${maxDispatches})`,
        );
      }
      if (inQuietHours(now())) {
        throw new GuardError(
          `quiet hours block dispatches from ${startHour}:00 to ${endHour}:00 UTC`,
        );
      }
      const lowered = text.toLowerCase();
      for (const term of blocklist) {
        if (term.length > 0 && lowered.includes(term)) {
          throw new GuardError(`text matches blocklisted term "${term}"`);
        }
      }
    },
    recordDispatch() {
      count += 1;
    },
  };
}

export interface VerifyRequest extends AddressInput {
  vendor?: AddressVendor;
  live?: boolean;
  apiKey?: string;
  authId?: string;
  guards?: Guards;
  logger?: Logger;
  onCost?: (entry: CostRecord) => void;
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

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export async function runVerify(
  req: VerifyRequest,
  adapters: Record<AddressVendor, VerifyAdapter>,
): Promise<AddressReceipt> {
  if (typeof req.street !== "string" || req.street.trim().length === 0) {
    throw new AdapterError("street is required");
  }
  const vendor = req.vendor ?? "dry";
  if (!Object.hasOwn(adapters, vendor)) {
    throw new AdapterError("Unknown address vendor");
  }
  const text = [req.street, req.line2, req.city, req.state, req.postal]
    .filter(Boolean)
    .join(" ");
  const guards = req.guards ?? createAddressGuards({ now: req.now });
  guards.checkDispatch(text);
  const logger = req.logger ?? noopLogger;
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
    if (error instanceof AdapterError) throw error;
    throw new AdapterError(`${vendor}: verification failed`, { cause: error });
  }
  const at = (req.now?.() ?? new Date()).toISOString();
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
      at,
    };
  }
  if (adapter.needsKey) {
    guards.recordDispatch();
    req.onCost?.({ kind: "dispatch", adapter: vendor, units: 1, at });
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
    at,
  };
}
