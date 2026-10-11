#!/usr/bin/env node
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  createLogger,
  getCostReport,
  GuardError,
  VendorError,
} from "agentic-core";
import { verifyAddress, type VerifyRequest } from "./address.js";
import { verifyCsv } from "./batch.js";
import { VERSION } from "./version.js";

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export interface CliRequest extends Partial<VerifyRequest> {
  command: "verify" | "batch" | "costs" | "mcp" | "help" | "version";
  inFile?: string;
  outFile?: string;
}

const VENDORS = ["dry", "local", "smartystreets", "lob", "postgrid", "osm"];

const flags = {
  "--vendor": "vendor",
  "--street": "street",
  "--line2": "line2",
  "--city": "city",
  "--state": "state",
  "--postal": "postal",
  "--country": "country",
  "--in": "inFile",
  "--out": "outFile",
} as const;

export function parseArgs(argv: string[]): CliRequest {
  const args = [...argv];
  const first = args.shift() ?? "help";
  const command =
    first === "--help" || first === "-h"
      ? "help"
      : first === "--version" || first === "-V"
        ? "version"
        : first;
  if (!["verify", "batch", "costs", "mcp", "help", "version"].includes(command)) {
    throw new UsageError(`unknown command "${first}"`);
  }
  const req: CliRequest = {
    command: command as CliRequest["command"],
    vendor: "dry",
    live: false,
  };
  while (args.length) {
    const flag = args.shift()!;
    if (flag === "--live" && (command === "verify" || command === "batch")) {
      req.live = true;
      continue;
    }
    if (!(flag in flags) || (command !== "verify" && command !== "batch")) {
      throw new UsageError(`unknown flag "${flag}"`);
    }
    if (command === "verify" && (flag === "--in" || flag === "--out")) {
      throw new UsageError(`unknown flag "${flag}"`);
    }
    if (
      command === "batch" &&
      !["--vendor", "--in", "--out"].includes(flag)
    ) {
      throw new UsageError(`unknown flag "${flag}"`);
    }
    const value = args.shift();
    if (!value || value.startsWith("--")) {
      throw new UsageError(`${flag} needs a value`);
    }
    Object.assign(req, { [flags[flag as keyof typeof flags]]: value });
  }
  if (!VENDORS.includes(req.vendor!)) throw new UsageError("invalid vendor");
  if (command === "verify" && !req.street) {
    throw new UsageError("verify needs --street");
  }
  if (command === "batch" && (!req.inFile || !req.outFile)) {
    throw new UsageError("batch needs --in and --out");
  }
  return req;
}

export interface CliIo {
  out(line: string): void;
  err(line: string): void;
  readFile(path: string): string;
  writeFile(path: string, text: string): void;
  now?: () => Date;
  fetchFn?: typeof fetch;
}

const defaultIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  readFile: (path) => readFileSync(path, "utf8"),
  writeFile: (path, text) => writeFileSync(path, text),
};

export function helpText(): string {
  return `Agentic address ${VERSION}
Verify postal addresses across vendors from CLI, SDK, or MCP.

Usage: agentic-address <command> [flags]
Commands: verify, batch, costs, mcp, help, version
verify --street <line> [--line2 <unit>] [--city <name>] [--state <code>]
  [--postal <code>] [--country <code>] [--vendor <name>] [--live]
batch --in <csv> --out <csv> [--vendor <name>] [--live]
costs: Print session cost JSON.
mcp: Start MCP on stdio.
--help, -h: Print help.
--version, -V: Print version.
Vendors: dry, local, smartystreets, lob, postgrid, osm.`;
}

export async function runCli(
  argv: string[],
  io: CliIo = defaultIo,
): Promise<number> {
  let req: CliRequest;
  try {
    req = parseArgs(argv);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (req.command === "help") {
    io.out(helpText());
    return 0;
  }
  if (req.command === "version") {
    io.out(VERSION);
    return 0;
  }
  if (req.command === "costs") {
    io.out(JSON.stringify(getCostReport()));
    return 0;
  }
  if (req.command === "mcp") {
    const { startMcp } = await import("./mcp.js");
    await startMcp();
    return 0;
  }
  const logger = createLogger({ quiet: true });
  try {
    if (req.command === "batch") {
      const text = io.readFile(req.inFile!);
      const csv = await verifyCsv(text, {
        vendor: req.vendor,
        live: req.live,
        fetchFn: io.fetchFn,
        now: io.now,
      });
      io.writeFile(req.outFile!, csv);
      io.out(JSON.stringify({ out: req.outFile }));
      return 0;
    }
    const receipt = await verifyAddress({
      street: req.street!,
      line2: req.line2,
      city: req.city,
      state: req.state,
      postal: req.postal,
      country: req.country,
      vendor: req.vendor,
      live: req.live,
      logger,
      fetchFn: io.fetchFn,
      now: io.now,
    });
    io.out(JSON.stringify(receipt));
    return 0;
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(error.message);
      return 2;
    }
    if (error instanceof GuardError || error instanceof VendorError) {
      io.err(error.message);
      return 1;
    }
    throw error;
  }
}

const invoked = process.argv[1] ?? "";
let isMain = false;
try {
  isMain =
    pathToFileURL(realpathSync(invoked)).href === import.meta.url;
} catch {
  isMain = false;
}

if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
