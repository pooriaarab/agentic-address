import { describe, expect, test } from "vitest";
import { parseCsv, verifyCsv } from "./batch.js";

const csv = [
  "street,line2,city,state,postal,country",
  "1600 Amphitheatre Parkway,,Mountain View,CA,94043,US",
  '"1 Infinite Loop, Suite 5",,Cupertino,CA,95014,US',
].join("\n");

describe("parseCsv", () => {
  test("parses rows with quoted commas", () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[1].street).toBe("1 Infinite Loop, Suite 5");
  });

  test("missing street column throws", async () => {
    await expect(verifyCsv("city\nBoston")).rejects.toThrow(
      "street column",
    );
  });

  test("empty input throws", async () => {
    await expect(verifyCsv("  \n")).rejects.toThrow("CSV is empty");
  });
});

describe("verifyCsv", () => {
  test("adds verified columns", async () => {
    const out = await verifyCsv(csv, { vendor: "local" });
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("verified_street");
    expect(lines[0]).toContain("deliverability");
    expect(lines[1]).toContain("1600 AMPHITHEATRE PKWY");
    expect(lines[1]).toContain("deliverable");
  });

  test("failed rows carry the error", async () => {
    const out = await verifyCsv('street\n" "\n', { vendor: "local" });
    const lines = out.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("street is required");
  });

  test("preview vendor never calls out", async () => {
    let calls = 0;
    const out = await verifyCsv(csv, {
      vendor: "lob",
      fetchFn: (async () => {
        calls += 1;
        return Response.json({});
      }) as typeof fetch,
    });
    expect(out).toContain("lob");
    expect(calls).toBe(0);
  });
});
