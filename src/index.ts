import { defineBrand } from "agentic-core";
import { VERSION } from "./version.js";

export { VERSION };

export const DEFAULT_BRAND = defineBrand({
  name: "Agentic address",
  command: "agentic-address",
  description: "Verify postal addresses across vendors from CLI, SDK, or MCP.",
  keywords: [
    "address-verification",
    "smarty-streets",
    "lob",
    "postgrid",
    "deliverability",
    "agentic-suite",
    "claude-code",
    "codex",
    "cli",
    "mcp",
  ],
  version: VERSION,
});

export * from "./address.js";
export * from "./batch.js";
export * from "./normalize.js";
export * from "./adapters/types.js";
export * from "./adapters/dry.js";
export * from "./adapters/smartystreets.js";
export * from "./adapters/lob.js";
export * from "./adapters/postgrid.js";
export * from "./adapters/osm.js";
export {
  createLogger,
  getCostReport,
  resetCosts,
} from "agentic-core";
// The verify path throws the local classes from ./adapters/error.js:
// AdapterError on vendor failures and GuardError on guard denials.
// VendorError stays exported as an alias of AdapterError so existing
// `instanceof VendorError` catches keep matching verify failures.
export {
  AdapterError,
  AdapterError as VendorError,
  GuardError,
} from "./adapters/error.js";
export type {
  BrandConfig,
  Logger,
  LoggerOptions,
  LogLevel,
  Guards,
  GuardsConfig,
  CapsConfig,
  QuietHoursConfig,
  CostEntry,
  CostReport,
} from "agentic-core";
