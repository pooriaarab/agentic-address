import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createAddressGuards,
  verifyAddress,
} from "./address.js";
import { getCostReport, resetCosts } from "agentic-core";
import { AdapterError, GuardError } from "./adapters/error.js";

const FIXED_NOW = () => new Date("2026-10-11T10:00:00Z");

const base = {
  street: "1600 Amphitheatre Parkway",
  city: "Mountain View",
  state: "CA",
  postal: "94043",
  country: "US",
};

afterEach(() => {
  vi.unstubAllEnvs();
  resetCosts();
});

describe("dry and local", () => {
  test("dry normalizes without a vendor call", async () => {
    const receipt = await verifyAddress({ ...base, now: FIXED_NOW });
    expect(receipt).toMatchObject({
      vendor: "dry",
      dryRun: true,
      deliverability: "deliverable",
    });
    expect(receipt.normalized).toMatchObject({
      street: "1600 AMPHITHEATRE PKWY",
      city: "MOUNTAIN VIEW",
      state: "CA",
      postal: "94043",
    });
    expect(receipt.at).toBe("2026-10-11T10:00:00.000Z");
    expect(getCostReport().dispatches).toBe(0);
  });

  test("local runs open validation live", async () => {
    const receipt = await verifyAddress({
      ...base,
      vendor: "local",
      live: true,
      now: FIXED_NOW,
    });
    expect(receipt.dryRun).toBe(false);
    expect(receipt.score).toBeGreaterThan(50);
    expect(getCostReport().dispatches).toBe(0);
  });
});

describe("keyed vendors", () => {
  test("preview without live never calls the vendor", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const receipt = await verifyAddress({
      ...base,
      vendor: "lob",
      fetchFn,
      now: FIXED_NOW,
    });
    expect(receipt.dryRun).toBe(true);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(receipt.notes[0]).toContain("preview");
  });

  test("live lob call maps the response", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "lob-1",
        deliverability: "deliverable",
        components: {
          primary_number: "1600",
          street_name: "Amphitheatre",
          street_suffix: "Pkwy",
          city: "Mountain View",
          state: "CA",
          zip_code: "94043",
        },
      }),
    );
    const receipt = await verifyAddress({
      ...base,
      vendor: "lob",
      live: true,
      apiKey: "key",
      fetchFn,
      now: FIXED_NOW,
    });
    expect(receipt).toMatchObject({
      vendor: "lob",
      dryRun: false,
      deliverability: "deliverable",
      score: 95,
      vendorId: "lob-1",
    });
    expect(getCostReport().dispatches).toBe(1);
  });

  test("missing key throws", async () => {
    await expect(
      verifyAddress({ ...base, vendor: "postgrid", live: true }),
    ).rejects.toBeInstanceOf(AdapterError);
  });

  test("smartystreets needs auth id and token", async () => {
    vi.stubEnv("SMARTYSTREETS_AUTH_ID", "id");
    await expect(
      verifyAddress({ ...base, vendor: "smartystreets", live: true }),
    ).rejects.toThrow("missing API key");
  });
});

describe("guards and input", () => {
  test("missing street throws", async () => {
    await expect(verifyAddress({ street: " " })).rejects.toThrow(
      "street is required",
    );
  });

  test("unknown vendor throws", async () => {
    await expect(
      verifyAddress({ ...base, vendor: "acme" as never }),
    ).rejects.toThrow("Unknown address vendor");
  });

  test("blocklist denies dispatch", async () => {
    const guards = createAddressGuards({ blocklist: ["amphitheatre"] });
    await expect(
      verifyAddress({ ...base, guards }),
    ).rejects.toBeInstanceOf(GuardError);
  });

  test("cap counts live keyed verifies only", async () => {
    const guards = createAddressGuards({
      caps: { maxDispatches: 1 },
      now: FIXED_NOW,
    });
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "lob-1",
        deliverability: "deliverable",
        components: {},
      }),
    );
    await verifyAddress({ ...base, vendor: "dry", guards, now: FIXED_NOW });
    await verifyAddress({
      ...base,
      vendor: "lob",
      live: true,
      apiKey: "key",
      guards,
      fetchFn,
      now: FIXED_NOW,
    });
    await expect(
      verifyAddress({
        ...base,
        vendor: "lob",
        live: true,
        apiKey: "key",
        guards,
        fetchFn,
        now: FIXED_NOW,
      }),
    ).rejects.toBeInstanceOf(GuardError);
  });
});
