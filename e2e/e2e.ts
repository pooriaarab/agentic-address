/**
 * Dry-run E2E for agentic-address/adapters against a local fake of the
 * PostGrid Address Verification API. Nothing real is sent: the fake runs
 * on 127.0.0.1 inside this Bun process, and the adapter's baseUrl points
 * at it. The fake serves only POST /v1/addver/verifications — the real
 * product route — so the old bundled /print-mail/v1 path earns a 404 and
 * a regression to it cannot pass. A street of "66 " inside a Springfield
 * city fails verification, everything else verifies — the same convention
 * the directory CRM fake uses (apps/web/e2e/fake-postgrid.ts).
 *
 * Run: bun e2e/e2e.ts
 */
import { AdapterError, verifyAddress } from "../src/adapters.js";

declare const Bun: {
  serve(opts: {
    port: number;
    hostname: string;
    fetch(req: Request): Response | Promise<Response>;
  }): { port: number; stop(): void };
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    if (req.headers.get("x-api-key") !== "test_postgrid_key") {
      return json({ error: "unauthorized" }, 401);
    }
    // Address Verification is its own PostGrid product; it never lived
    // under /print-mail/v1, so the fake refuses the bundled route.
    if (
      url.pathname === "/print-mail/v1/addver/verifications" &&
      req.method === "POST"
    ) {
      return json(
        {
          status: "error",
          error: {
            type: "invalid_route_error",
            message: "The requested route does not exist",
          },
        },
        404,
      );
    }
    if (url.pathname === "/v1/addver/verifications" && req.method === "POST") {
      const { address } = (await req.json()) as {
        address: {
          line1?: string;
          line2?: string;
          city?: string;
          provinceOrState?: string;
          postalOrZip?: string;
          country?: string;
        };
      };
      const line1 = address.line1 ?? "";
      const bad = address.city === "Springfield" && line1.includes("66 ");
      return json({
        status: "success",
        data: {
          id: `adr_${bad ? "bad" : "ok"}1`,
          status: bad ? "failed" : "verified",
          line1: line1.toUpperCase(),
          line2: (address.line2 ?? "").toUpperCase(),
          city: (address.city ?? "").toUpperCase(),
          provinceOrState: (address.provinceOrState ?? "").toUpperCase(),
          postalOrZip: address.postalOrZip ?? "",
          country: (address.country ?? "us").toUpperCase(),
          errors: bad
            ? { line1: ["Missing Value: Suite identifier"] }
            : {},
          residential: true,
          vacant: false,
        },
      });
    }
    return json({ error: "not found" }, 404);
  },
});

const baseUrl = `http://127.0.0.1:${server.port}`;
let passed = 0;
const check = (name: string, cond: boolean) => {
  if (!cond) throw new Error(`FAIL: ${name}`);
  passed += 1;
  console.log(`ok ${name}`);
};

// The fake refuses the bundled print-mail route the adapter used to post
// to, so this E2E fails if that path ever comes back.
const oldRoute = await fetch(`${baseUrl}/print-mail/v1/addver/verifications`, {
  method: "POST",
  headers: { "x-api-key": "test_postgrid_key" },
  body: "{}",
});
check("old bundled route is refused", oldRoute.status === 404);

const good = await verifyAddress({
  vendor: "postgrid",
  live: true,
  apiKey: "test_postgrid_key",
  baseUrl,
  street: "1 Main St",
  city: "Boston",
  state: "MA",
  postal: "02108",
});
check("good address verifies live", good.dryRun === false);
check("good address is deliverable", good.deliverability === "deliverable");
check("vendor id returned", good.vendorId === "adr_ok1");
check("street normalized", good.normalized.street === "1 MAIN ST");

const bad = await verifyAddress({
  vendor: "postgrid",
  live: true,
  apiKey: "test_postgrid_key",
  baseUrl,
  street: "66 Elm St",
  city: "Springfield",
  state: "IL",
  postal: "62701",
});
check("bad address is undeliverable", bad.deliverability === "undeliverable");
check("bad address scores low", bad.score < 50);

let threw = false;
try {
  await verifyAddress({
    vendor: "postgrid",
    live: true,
    baseUrl,
    street: "1 Main St",
  });
} catch (error) {
  threw = error instanceof AdapterError;
}
check("missing key is refused", threw);

// The adapters path never returns a local score dressed as a verdict:
// a keyed vendor without live: true throws even with a key in hand,
// "local" heuristic scoring is refused outright, and only an explicit
// "dry" run previews — always reporting deliverability "unknown".
threw = false;
try {
  await verifyAddress({
    vendor: "postgrid",
    apiKey: "test_postgrid_key",
    baseUrl,
    street: "1 Main St",
  });
} catch (error) {
  threw = error instanceof AdapterError;
}
check("no live flag is refused even with a key", threw);

threw = false;
try {
  await verifyAddress({ vendor: "local", street: "1 Main St" });
} catch (error) {
  threw = error instanceof AdapterError;
}
check("local heuristic scoring is refused", threw);

const dry = await verifyAddress({
  vendor: "dry",
  street: "1 Main St",
});
check("dry run still previews", dry.dryRun === true);
check(
  "dry preview never reads deliverable",
  dry.deliverability === "unknown",
);

server.stop();
console.log(`PASS ${passed} checks`);
