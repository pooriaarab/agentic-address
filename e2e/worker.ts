import { verifyAddress } from "../src/adapters.js";

// Bundling proof for the /adapters entry point: this worker imports only
// the fetch-only subpath surface, so `wrangler deploy --dry-run` shows it
// packs for Cloudflare Workers. Keys arrive as request/env arguments.

export interface WorkerEnv {
  POSTGRID_API_KEY?: string;
  POSTGRID_API_BASE?: string;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true });
    }
    if (request.method === "POST" && url.pathname === "/verify") {
      const body = (await request.json().catch(() => null)) as {
        street?: string;
        city?: string;
        state?: string;
        postal?: string;
        country?: string;
      } | null;
      if (!body?.street) return json({ error: "street is required" }, 400);
      const receipt = await verifyAddress({
        vendor: env.POSTGRID_API_KEY ? "postgrid" : "dry",
        live: Boolean(env.POSTGRID_API_KEY),
        apiKey: env.POSTGRID_API_KEY,
        baseUrl: env.POSTGRID_API_BASE,
        street: body.street,
        city: body.city,
        state: body.state,
        postal: body.postal,
        country: body.country,
      });
      return json(receipt);
    }
    return json({ error: "not found" }, 404);
  },
};
