# agentic-address

[![npm version](https://img.shields.io/npm/v/agentic-address)](https://www.npmjs.com/package/agentic-address) [![Downloads/month](https://img.shields.io/npm/dm/agentic-address)](https://www.npmjs.com/package/agentic-address) [![MIT license](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/license/mit)

[Package](https://www.npmjs.com/package/agentic-address) · [API and setup](#integration-guides) · [Support](https://github.com/pooriaarab/agentic-address/issues)

agentic-address is an open-source postal address verification toolkit for developers and agents. It exposes vendor adapters through a JavaScript SDK, command-line interface (CLI), and Model Context Protocol (MCP) server. Local normalization and previews work without credentials.

## Install

```sh
npm install agentic-address
```

Use Node.js 18 or later. The package includes TypeScript declarations and has three direct runtime dependencies.

## Verify your first address

Run an offline preview. No environment variables or network access are required.

```sh
npx agentic-address verify --street "1600 Amphitheatre Parkway" --city "Mountain View" --state CA --postal 94043
```

The JSON receipt contains `dryRun: true`, `normalized.street: "1600 AMPHITHEATRE PKWY"`, and `score: 90`.
These values describe a format preview, not confirmed delivery.

The SDK uses the same request:

```js
import { verifyAddress } from 'agentic-address';

const receipt = await verifyAddress({
  street: '1600 Amphitheatre Parkway',
  city: 'Mountain View', state: 'CA', postal: '94043',
});
console.log(receipt.normalized.street, receipt.score, receipt.dryRun);
```

## How it works

```text
SDK / CLI / MCP → verifyAddress → guards → selected adapter → receipt
                                          ├─ dry / local: offline
                                          └─ vendor: HTTP request
CSV rows → verifyCsv → verifyAddress per row → CSV with results or errors
```

## Why it exists

Smarty, Lob, and PostGrid have different request and response formats.
agentic-address maps selected responses into one receipt with normalized fields, deliverability, score, notes, and vendor identity.
It also provides an offline preview before a keyed request.

## Compare

Checked 2026-10-14 against source and the linked provider documentation. Compare this toolkit with direct API access.

| Scope | agentic-address | [Smarty](https://www.smarty.com/docs/apis/us-street-api/reference) | [Lob](https://docs.lob.com/) | [PostGrid](https://avdocs.postgrid.com/) |
| --- | --- | --- | --- | --- |
| Interface here | Shared SDK, CLI, MCP | Provider HTTP API | Provider HTTP API | Provider HTTP API |
| Execution | Your Node.js process | Remote API | Remote API | Remote API |
| Configuration | Request options or environment | Provider credentials | Provider credentials | Provider credentials |
| Result model | Reduced common receipt | Native provider response | Native provider response | Native provider response |

## Coverage

The dispatcher contains six modes, including four HTTP integrations. These are implemented adapters, with live credential verification pending.

| Mode / integration | Implementation | Meaning |
| --- | --- | --- |
| Dry preview (`dry`) | Offline | Normalization and field score; no vendor call |
| Local checks (`local`) | Offline | Field completeness heuristic |
| Smarty / SmartyStreets (`smartystreets`) | HTTP adapter; live verification pending | US street endpoint and delivery point validation signals |
| Lob (`lob`) | HTTP adapter; live verification pending | US verifications endpoint |
| PostGrid (`postgrid`) | HTTP adapter; live verification pending | Address verification response mapping |
| OpenStreetMap Nominatim (`osm`) | HTTP adapter; live verification pending | Search match with an importance-based heuristic |

No provider credentials were used for this README review. Mocked tests check request and response handling.
OpenStreetMap lookup is not postal delivery confirmation.

## Common use cases

1. **Node.js developers:** normalize form fields offline before choosing a postal verification provider.
2. **Lob users:** verify addresses from a CSV before a separate mailing workflow.
3. **PostGrid users:** inspect normalized fields and review risky results in an application.
4. **MCP client developers:** expose address previews and CSV verification to an agent through stdio.

## Features

- **Normalization:** uppercase fields, shorten selected street suffixes, and format nine-digit US ZIP codes.
- **Receipts:** return a 0–100 score, deliverability band, notes, and nullable residential and vacant flags.
- **CSV batches:** process rows sequentially and retain row errors in the output.
- **Guards:** accept shared caps, blocklists, and clocks through `createAddressGuards`.
- **Cost reports:** count successful keyed dispatch units within the current process; these are not billing amounts.

## Runtime surfaces

The SDK exports `verifyAddress`, `verifyCsv`, normalization helpers, adapters, and core guard, logging, and cost utilities.
CLI commands are `verify`, `batch`, `costs`, `mcp`, `help`, and `version`.
Aliases are `--help`, `-h`, `--version`, and `-V`.

```sh
npx agentic-address batch --in addresses.csv --out verified.csv --vendor dry
npx agentic-address mcp
npx --package agentic-address agentic-address-mcp
```

MCP tools are `verify_address`, `batch_verify`, and `get_cost_report`.
Configure a stdio client with:

```json
{"mcpServers":{"agentic-address":{"command":"npx","args":["agentic-address","mcp"]}}}
```

The self-hosted Worker source serves `GET /health`, `POST /preview`, `POST /verify`, and `POST /batch`.
Preview always uses `dry`. Verify and batch accept only `dry`, `local`, and `osm`.
The package does not supply a managed Worker service.

### Edge runtimes (Cloudflare Workers)

`agentic-address/adapters` is a fetch-only entry point for hosts with no filesystem and no `process.env`. Every credential arrives as an argument; nothing is read from the environment. It re-exports the adapter classes plus a `verifyAddress` that takes the same request plus a `baseUrl` override for local fakes.

```js
import { verifyAddress } from 'agentic-address/adapters';

const receipt = await verifyAddress({
  vendor: 'postgrid', live: true,
  apiKey: env.POSTGRID_ADDVER_API_KEY, // key passed in, never read from env
  baseUrl: env.POSTGRID_API_BASE,      // optional: point at a fake for E2E
  street: '1 Main St', city: 'Boston', state: 'MA', postal: '02108',
});
```

The `/adapters` entry imports nothing from `agentic-core`, so the bundle needs no `nodejs_compat` flag at all. Failures throw `AdapterError` (`code: "VENDOR_FAILED"`) and guard denials throw `GuardError` (`code: "GUARD_DENIED"`), both defined in the entry. Logging stays silent unless you pass a `logger`; cost records go to the `onCost` callback you pass in. On this path a verify either calls the vendor or refuses: a non-`dry` vendor without `live: true` throws (even with a key), `local` heuristic scoring is refused outright, and an explicit `dry` preview reports `deliverability: "unknown"` so it can never read as deliverable. See `e2e/worker.ts` and `e2e/e2e.ts` for a bundled proof and a dry-run E2E against a local fake.

## Delivery and behavior limits

Keyed adapters use dry preview unless `live: true` or `--live` is set.
`osm` performs network lookup even when `live` is false. `local` stays offline and returns `dryRun: false`.
HTTP calls time out after ten seconds. The HTTP helper does not retry.
Scores map provider signals or field heuristics; they do not guarantee mail delivery.
The local state-name map covers ten US states, not every state or international address format.
CSV requires a `street` header. Optional headers are `line2`, `city`, `state`, `postal`, and `country`.
The parser does not support multiline quoted cells. Output has fixed columns and discards unrelated input columns.
Reuse a guard instance for cumulative SDK caps. Batch calls create separate guards per row.
Cost totals are process-local; a later CLI invocation does not recover a previous process's totals.

## Integration guides

Export credentials through your shell or secret store. The package does not automatically load `.env` files.
Authorize live provider calls before enabling them.

| Adapter | Environment variables |
| --- | --- |
| Smarty / SmartyStreets | `SMARTYSTREETS_AUTH_ID`, `SMARTYSTREETS_AUTH_TOKEN` |
| Lob | `LOB_API_KEY` |
| PostGrid | `POSTGRID_ADDVER_API_KEY` (the Address Verification product's key — not the Print & Mail `POSTGRID_API_KEY`) |
| OpenStreetMap Nominatim | None |

```sh
export LOB_API_KEY='your-key'
npx agentic-address verify --vendor lob --live --street "1600 Amphitheatre Parkway" --city "Mountain View" --state CA --postal 94043
```

A successful call prints `vendor: "lob"`, `dryRun: false`, and the mapped verification receipt.
The SDK also accepts `apiKey`, plus `authId` for Smarty.

- [Smarty US street request and response reference](https://www.smarty.com/docs/apis/us-street-api/reference)
- [Lob address verification API reference](https://docs.lob.com/)
- [PostGrid address verification API reference](https://avdocs.postgrid.com/)

## Status

Version 0.1.1 is an early release. Interfaces and score mappings can change before 1.0.
[Report bugs or request support](https://github.com/pooriaarab/agentic-address/issues).
Public case studies are not yet published in this repository.
Contributors should run build, typecheck, and tests before submitting changes.

## FAQ

### What is agentic-address?

agentic-address is a postal address toolkit with SDK, CLI, and MCP interfaces. It combines offline normalization with selected provider adapters.

### Which integrations are verified?

agentic-address implements Smarty, Lob, PostGrid, and OpenStreetMap HTTP adapters. This review checks source and mocked tests; live provider verification remains pending.

### Does agentic-address provide managed address verification?

agentic-address runs in your own process. Keyed verification requires your provider account and credentials.

### How is agentic-address different from Smarty?

agentic-address wraps selected Smarty US street response fields in a shared receipt. Direct Smarty API access exposes its native response and options.

### How is agentic-address different from Lob?

agentic-address wraps Lob US address verification and adds preview, CSV, and agent interfaces. Its Lob adapter does not send mail.

### How is agentic-address different from PostGrid?

agentic-address maps selected PostGrid verification fields into the common receipt. Its adapter does not expose PostGrid print or mail operations.

### Can I verify addresses without an API key?

agentic-address offers dry and local field checks without credentials. Its OpenStreetMap mode also needs no key, but uses network search.

### Does a high score guarantee delivery?

agentic-address computes scores from mapped signals or heuristics. A high score does not establish postal delivery for offline or OpenStreetMap results.

### Does agentic-address load my .env file?

agentic-address reads process environment variables and explicit SDK options. Load your environment before starting the CLI or SDK.

## License

MIT. Copyright Pooria Arab.
