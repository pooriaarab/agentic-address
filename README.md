# Agentic address

Verify postal addresses across vendors from CLI, SDK, or MCP.

## Install

Use Node.js 18 or later.

```sh
npm install agentic-address
```

## Quickstart

Preview is the default. No key is needed for a preview.
Keyed vendors preview without a network call until you add `--live`.

```sh
npx agentic-address verify --street "1600 Amphitheatre Parkway" --city "Mountain View" --state CA --postal 94043
npx agentic-address verify --vendor local --live --street "1600 Amphitheatre Parkway" --postal 94043
npx agentic-address costs
```

Use the SDK with the same inputs.

```js
import { verifyAddress } from 'agentic-address';

const receipt = await verifyAddress({
  street: '1600 Amphitheatre Parkway',
  city: 'Mountain View',
  state: 'CA',
  postal: '94043',
});
console.log(receipt);
```

Every receipt carries a normalized address, a deliverability
band (`deliverable`, `risky`, `undeliverable`, `unknown`),
and a 0-100 score.

## Live verifies and keys

A live verify needs `--live`, a vendor, and its API key in the environment.
Set keys through your shell or secret store.

| Vendor | Environment key | Notes |
| --- | --- | --- |
| SmartyStreets | SMARTYSTREETS_AUTH_ID, SMARTYSTREETS_AUTH_TOKEN | US street API |
| Lob | LOB_API_KEY | US verifications |
| PostGrid | POSTGRID_API_KEY | Address verification |
| OpenStreetMap | None | Nominatim, open |
| Local | None | Offline format checks |

```sh
npx agentic-address verify --vendor smartystreets --live --street "1600 Amphitheatre Parkway" --postal 94043
npx agentic-address verify --vendor lob --live --street "1600 Amphitheatre Parkway" --city "Mountain View" --state CA --postal 94043
npx agentic-address verify --vendor postgrid --live --street "1600 Amphitheatre Parkway" --postal 94043 --country US
npx agentic-address verify --vendor osm --live --street "1600 Amphitheatre Parkway" --city "Mountain View"
```

Adapters also accept `apiKey` (and `authId` for SmartyStreets)
constructor options for direct SDK use. `verifyAddress`
accepts the same options, and falls back to the environment.

## Use cases

Use case 1: check one address before you mail a letter.
Preview first. Add `--live` with a vendor when the preview looks right.

```sh
npx agentic-address verify --street "1600 Amphitheatre Parkway" --postal 94043
npx agentic-address verify --vendor smartystreets --live --street "1600 Amphitheatre Parkway" --postal 94043
```

Use case 2: clean a list before a postcard run.
Put one address per row in a CSV file with a `street` column
and optional `line2`, `city`, `state`, `postal`, `country` columns.

```sh
npx agentic-address batch --in addresses.csv --out verified.csv --vendor lob --live
```

The output keeps the input columns and adds `verified_street`,
`verified_city`, `verified_state`, `verified_postal`,
`verified_country`, `deliverability`, `score`, `vendor`, and `error`.
Rows that fail keep their input and carry the error text.

Use case 3: gate an order form with the SDK.
Reject undeliverable addresses. Flag risky ones for review.

```js
import { verifyAddress } from 'agentic-address';

const receipt = await verifyAddress({
  vendor: 'postgrid',
  live: true,
  street: order.street,
  postal: order.postal,
  country: 'US',
});
if (receipt.deliverability === 'undeliverable') throw new Error('Bad address');
if (receipt.deliverability === 'risky') flagForReview(order, receipt);
```

Use case 4: check addresses from an agent over MCP.
Preview through `verify_address`. Clean lists through `batch_verify`.

```json
{
  "mcpServers": {
    "agentic-address": {
      "command": "npx",
      "args": ["agentic-address", "mcp"]
    }
  }
}
```

## Normalization and score

`normalizeAddress` uppercases the address and shortens common
suffixes to USPS form (`Parkway` to `PKWY`, `Suite` to `STE`).
It formats 9-digit ZIP codes with a dash.
Vendor results return the vendor spelling in the same case.

The score runs from 0 to 100. Vendor bands drive keyed scores:
a SmartyStreets DPV `Y` scores 95, Lob `deliverable` scores 95,
PostGrid `verified` scores 95. The local and dry vendors score
from the fields present: a full street, city, state, and ZIP
reaches 90 or more.

## Guards and costs

`createAddressGuards` accepts caps, a blocklist, and a clock.
Reuse a guard instance to enforce a cap across verifies.
Preview and open vendors never count toward the cap or cost report.
Live keyed verifies record one dispatch and one cost unit each.
Costs count dispatches, not vendor billing amounts.

## MCP

Start the stdio server with either command.

```sh
npx agentic-address mcp
npx --package agentic-address agentic-address-mcp
```

Tools are `verify_address`, `batch_verify`, and `get_cost_report`.
`verify_address` defaults to vendor `dry` and `live: false`.
`batch_verify` takes CSV text and returns CSV text.
Errors from guards and vendors return `isError: true`.

## Worker API

The Worker serves `GET /health`, `POST /preview`, `POST /verify`,
and `POST /batch`. Preview always runs the dry vendor.
Verify and batch accept the open vendors (`dry`, `local`, `osm`) only.
Keyed vendors stay out of the Worker, so keys never cross it.

## License

MIT. Copyright Pooria Arab.
