import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import worker from "./worker.js";
import { VERSION } from "./version.js";

test("health and version", async () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  expect(VERSION).toBe(pkg.version);
  expect(
    await (await worker.fetch(new Request("https://address/health"))).json(),
  ).toEqual({ ok: true, pack: "agentic-address", version: VERSION });
});

test("preview forces dry and rejects bad input", async () => {
  const response = await worker.fetch(
    new Request("https://address/preview", {
      method: "POST",
      body: JSON.stringify({
        street: "1600 Amphitheatre Parkway",
        live: true,
        vendor: "lob",
      }),
    }),
  );
  expect(await response.json()).toMatchObject({ dryRun: true, vendor: "dry" });
  for (const body of ["bad", "{}", "null", JSON.stringify({ street: " " })]) {
    expect(
      (
        await worker.fetch(
          new Request("https://address/preview", { method: "POST", body }),
        )
      ).status,
    ).toBe(400);
  }
});

test("verify and batch accept open vendors only", async () => {
  const ok = await worker.fetch(
    new Request("https://address/verify", {
      method: "POST",
      body: JSON.stringify({
        street: "1600 Amphitheatre Parkway",
        vendor: "local",
      }),
    }),
  );
  expect(await ok.json()).toMatchObject({ vendor: "local", dryRun: false });
  const denied = await worker.fetch(
    new Request("https://address/verify", {
      method: "POST",
      body: JSON.stringify({ street: "1600 Main St", vendor: "lob" }),
    }),
  );
  expect(denied.status).toBe(400);
  const batch = await worker.fetch(
    new Request("https://address/batch", {
      method: "POST",
      body: JSON.stringify({ csv: "street\n1600 Main St\n" }),
    }),
  );
  expect((await batch.json()) as { csv: string }).toMatchObject({
    csv: expect.stringContaining("verified_street"),
  });
  const batchDenied = await worker.fetch(
    new Request("https://address/batch", {
      method: "POST",
      body: JSON.stringify({ csv: "street\n1 Main St\n", vendor: "lob" }),
    }),
  );
  expect(batchDenied.status).toBe(400);
});

test("404", async () => {
  expect((await worker.fetch(new Request("https://address/other"))).status).toBe(
    404,
  );
});
