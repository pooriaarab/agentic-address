import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createLogger,
  getCostReport,
  GuardError,
  VendorError,
  type Guards,
  type Logger,
} from "agentic-core";
import { verifyAddress } from "./address.js";
import { verifyCsv } from "./batch.js";
import { DEFAULT_BRAND } from "./index.js";

export interface McpDeps {
  guards?: Guards;
  logger?: Logger;
  now?: () => Date;
  fetchFn?: typeof fetch;
}

const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});

const vendorSchema = z
  .enum(["dry", "local", "smartystreets", "lob", "postgrid", "osm"])
  .default("dry");

const addressShape = {
  vendor: vendorSchema,
  street: z.string(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postal: z.string().optional(),
  country: z.string().optional(),
  live: z.boolean().default(false),
};

export function createMcpServer(deps: McpDeps = {}): McpServer {
  const server = new McpServer({
    name: DEFAULT_BRAND.command,
    version: DEFAULT_BRAND.version,
  });
  server.registerTool(
    "verify_address",
    {
      description: "Verify one postal address. Keyed vendors preview by default.",
      inputSchema: addressShape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return result(
          await verifyAddress({
            ...input,
            ...deps,
            logger: deps.logger ?? createLogger({ quiet: true }),
          }),
        );
      } catch (error) {
        if (error instanceof GuardError || error instanceof VendorError) {
          return { ...result({ error: error.message }), isError: true };
        }
        throw error;
      }
    },
  );
  server.registerTool(
    "batch_verify",
    {
      description: "Verify CSV rows. Returns CSV with verified columns.",
      inputSchema: {
        vendor: vendorSchema,
        csv: z.string(),
        live: z.boolean().default(false),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        return result(
          await verifyCsv(input.csv, {
            vendor: input.vendor,
            live: input.live,
            fetchFn: deps.fetchFn,
            now: deps.now,
          }),
        );
      } catch (error) {
        if (error instanceof GuardError || error instanceof VendorError) {
          return { ...result({ error: error.message }), isError: true };
        }
        throw error;
      }
    },
  );
  server.registerTool(
    "get_cost_report",
    {
      description: "Read session cost totals.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(getCostReport()),
  );
  return server;
}

export async function startMcp(deps: McpDeps = {}): Promise<void> {
  await createMcpServer(deps).connect(new StdioServerTransport());
}
