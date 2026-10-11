import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { createMcpServer } from "./mcp.js";

test("real client tools and mapped vendor error", async () => {
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({
    now: () => new Date("2026-10-11T10:00:00Z"),
  });
  const client = new Client({ name: "probe", version: "1" });
  await server.connect(st);
  await client.connect(ct);
  try {
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "batch_verify",
      "get_cost_report",
      "verify_address",
    ]);
    expect(
      tools.find((t) => t.name === "verify_address")?.annotations,
    ).toMatchObject({
      openWorldHint: true,
      readOnlyHint: false,
      idempotentHint: true,
      destructiveHint: false,
    });
    const preview = await client.callTool({
      name: "verify_address",
      arguments: { street: "1600 Amphitheatre Parkway", vendor: "lob" },
    });
    expect(
      JSON.parse((preview.content as { text: string }[])[0].text),
    ).toMatchObject({ dryRun: true, vendor: "lob" });
    expect(
      (
        await client.callTool({
          name: "verify_address",
          arguments: { street: " ", vendor: "local" },
        })
      ).isError,
    ).toBe(true);
    const batch = await client.callTool({
      name: "batch_verify",
      arguments: { csv: "street\n1600 Amphitheatre Parkway\n" },
    });
    expect((batch.content as { text: string }[])[0].text).toContain(
      "verified_street",
    );
    expect(
      (
        await client.callTool({ name: "get_cost_report", arguments: {} })
      ).isError,
    ).not.toBe(true);
  } finally {
    await client.close();
    await server.close();
  }
});
