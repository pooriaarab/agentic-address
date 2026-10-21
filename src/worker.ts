import { createLogger } from "agentic-core";
import { AdapterError, GuardError } from "./adapters/error.js";
import { verifyAddress, type VerifyRequest } from "./address.js";
import { verifyCsv } from "./batch.js";
import { VERSION } from "./version.js";

const OPEN_VENDORS = ["dry", "local", "osm"];

export default {
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      return Response.json({
        ok: true,
        pack: "agentic-address",
        version: VERSION,
      });
    }
    if (request.method === "POST" && path === "/preview") {
      let body: VerifyRequest;
      try {
        body = (await request.json()) as VerifyRequest;
        if (!body || typeof body !== "object" || !body.street) {
          return Response.json(
            { error: "street is required" },
            { status: 400 },
          );
        }
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
      try {
        return Response.json(
          await verifyAddress({
            street: body.street,
            line2: body.line2,
            city: body.city,
            state: body.state,
            postal: body.postal,
            country: body.country,
            vendor: "dry",
            live: false,
            logger: createLogger({ quiet: true }),
          }),
        );
      } catch (error) {
        if (error instanceof GuardError || error instanceof AdapterError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }
    if (request.method === "POST" && path === "/verify") {
      let body: VerifyRequest;
      try {
        body = (await request.json()) as VerifyRequest;
        if (!body || typeof body !== "object" || !body.street) {
          return Response.json(
            { error: "street is required" },
            { status: 400 },
          );
        }
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
      const vendor = body.vendor ?? "dry";
      if (!OPEN_VENDORS.includes(vendor)) {
        return Response.json(
          { error: "verify accepts dry, local, or osm only" },
          { status: 400 },
        );
      }
      try {
        return Response.json(
          await verifyAddress({
            ...body,
            vendor,
            live: false,
            logger: createLogger({ quiet: true }),
          }),
        );
      } catch (error) {
        if (error instanceof GuardError || error instanceof AdapterError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }
    if (request.method === "POST" && path === "/batch") {
      let body: { csv?: unknown; vendor?: unknown };
      try {
        body = (await request.json()) as { csv?: unknown; vendor?: unknown };
        if (!body || typeof body !== "object" || typeof body.csv !== "string") {
          return Response.json({ error: "csv is required" }, { status: 400 });
        }
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }
      const vendor =
        body.vendor === undefined ? "dry" : String(body.vendor);
      if (!OPEN_VENDORS.includes(vendor)) {
        return Response.json(
          { error: "batch accepts dry, local, or osm only" },
          { status: 400 },
        );
      }
      try {
        const csv = await verifyCsv(body.csv, {
          vendor: vendor as VerifyRequest["vendor"],
          live: false,
        });
        return Response.json({ csv });
      } catch (error) {
        if (error instanceof GuardError || error instanceof AdapterError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        throw error;
      }
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },
};
