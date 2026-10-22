import { afterEach, describe, expect, test, vi } from "vitest";
import { AdapterError } from "./error.js";
import { SmartyStreetsAdapter } from "./smartystreets.js";
import { LobAdapter } from "./lob.js";
import { PostGridAdapter } from "./postgrid.js";
import { OsmAdapter } from "./osm.js";
import { DryAdapter, LocalAdapter } from "./dry.js";

const input = {
  street: "1600 Amphitheatre Parkway",
  city: "Mountain View",
  state: "CA",
  postal: "94043",
  country: "US",
};

afterEach(() => vi.unstubAllEnvs());

describe("dry and local", () => {
  test("dry returns a preview note", async () => {
    const result = await new DryAdapter().verify(input);
    expect(result.vendorId).toBeNull();
    expect(result.signals.notes[0]).toContain("dry run");
  });

  test("local scores the open way", async () => {
    const result = await new LocalAdapter().verify(input);
    expect(result.signals.score).toBeGreaterThan(50);
  });
});

describe("smartystreets", () => {
  const candidate = {
    delivery_line_1: "1600 Amphitheatre Pkwy",
    components: {
      primary_number: "1600",
      street_name: "Amphitheatre",
      street_suffix: "Pkwy",
      city_name: "Mountain View",
      state_abbreviation: "CA",
      zipcode: "94043",
      plus4_code: "1234",
    },
    metadata: { residential: false, vacant: false },
    analysis: { dpv_match_code: "Y", dpv_footnotes: "", active: "Y" },
  };

  test("maps candidate and score", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json([candidate]));
    const result = await new SmartyStreetsAdapter({
      authId: "id",
      apiKey: "token",
    }).verify(input, { fetchFn });
    expect(result.signals).toMatchObject({
      deliverability: "deliverable",
      score: 95,
    });
    expect(result.normalized).toMatchObject({ postal: "94043-1234" });
    const [url] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("us-street.api.smarty.com");
    expect(String(url)).toContain("auth-id=id");
  });

  test("DPV N scores low", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        { ...candidate, analysis: { dpv_match_code: "N", active: "Y" } },
      ]),
    );
    const result = await new SmartyStreetsAdapter({
      authId: "id",
      apiKey: "token",
    }).verify(input, { fetchFn });
    expect(result.signals.deliverability).toBe("undeliverable");
  });

  test("empty candidates throw", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    await expect(
      new SmartyStreetsAdapter({ authId: "id", apiKey: "token" }).verify(
        input,
        { fetchFn },
      ),
    ).rejects.toThrow("no candidates");
  });

  test("missing key throws", async () => {
    await expect(new SmartyStreetsAdapter().verify(input)).rejects.toThrow(
      "missing API key",
    );
  });
});

describe("lob", () => {
  test("maps deliverability and posts JSON", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        id: "lob-1",
        deliverability: "deliverable_missing_unit",
        components: {
          primary_number: "1600",
          street_name: "Amphitheatre",
          city: "Mountain View",
          state: "CA",
          zip_code: "94043",
        },
      }),
    );
    const result = await new LobAdapter({ apiKey: "key" }).verify(input, {
      fetchFn,
    });
    expect(result.signals).toMatchObject({ score: 80 });
    expect(result.vendorId).toBe("lob-1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.lob.com/v1/us_verifications");
    expect(init?.headers).toMatchObject({
      Authorization: expect.stringContaining("Basic "),
    });
    expect(JSON.parse(init!.body as string)).toMatchObject({
      primary_line: input.street,
    });
  });

  test("bad payload throws", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
    await expect(
      new LobAdapter({ apiKey: "key" }).verify(input, { fetchFn }),
    ).rejects.toThrow("invalid response");
  });

  test("missing key throws", async () => {
    await expect(new LobAdapter().verify(input)).rejects.toThrow(
      "missing API key",
    );
  });
});

describe("postgrid", () => {
  const respond = (data: Record<string, unknown>) =>
    vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ status: "success", data }),
    );

  test("maps status with x-api-key on the addver route", async () => {
    const fetchFn = respond({
      id: "pg-1",
      status: "corrected",
      line1: "1600 Amphitheatre Pkwy",
      city: "Mountain View",
      provinceOrState: "CA",
      postalOrZip: "94043",
      country: "US",
      errors: { postalOrZip: ["Corrected Value: ZIP"] },
    });
    const result = await new PostGridAdapter({ apiKey: "key" }).verify(input, {
      fetchFn,
    });
    expect(result.signals).toMatchObject({
      deliverability: "deliverable",
      score: 85,
    });
    expect(result.signals.notes).toContain("postalOrZip: Corrected Value: ZIP");
    expect(result.vendorId).toBe("pg-1");
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.postgrid.com/v1/addver/verifications");
    expect(init?.headers).toMatchObject({ "x-api-key": "key" });
    expect(JSON.parse(init!.body as string)).toMatchObject({
      address: { country: "us" },
    });
  });

  test("verified and failed map to the documented verdicts", async () => {
    const good = await new PostGridAdapter({ apiKey: "key" }).verify(input, {
      fetchFn: respond({ status: "verified", errors: {} }),
    });
    expect(good.signals.deliverability).toBe("deliverable");
    const bad = await new PostGridAdapter({ apiKey: "key" }).verify(input, {
      fetchFn: respond({
        status: "failed",
        errors: { line1: ["Missing Value: Suite identifier"] },
      }),
    });
    expect(bad.signals.deliverability).toBe("undeliverable");
  });

  test("an undocumented status reads the errors object", async () => {
    const withErrors = await new PostGridAdapter({ apiKey: "key" }).verify(
      input,
      {
        fetchFn: respond({
          status: "unknown-verdict",
          errors: { city: ["Missing Value: City"] },
        }),
      },
    );
    expect(withErrors.signals.deliverability).toBe("undeliverable");
    const silent = await new PostGridAdapter({ apiKey: "key" }).verify(input, {
      fetchFn: respond({ status: "unknown-verdict", errors: {} }),
    });
    expect(silent.signals.deliverability).toBe("risky");
  });

  test("HTTP failure carries status", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 429 }));
    await expect(
      new PostGridAdapter({ apiKey: "key" }).verify(input, { fetchFn }),
    ).rejects.toMatchObject({ status: 429 });
  });

  test("network failure throws", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error("down"));
    await expect(
      new PostGridAdapter({ apiKey: "key" }).verify(input, { fetchFn }),
    ).rejects.toBeInstanceOf(AdapterError);
  });
});

describe("osm", () => {
  test("maps the open result", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json([
        {
          display_name: "1600, Amphitheatre Parkway, Mountain View",
          importance: 0.7,
          address: {
            house_number: "1600",
            road: "Amphitheatre Parkway",
            city: "Mountain View",
            state: "California",
            postcode: "94043",
            country_code: "us",
          },
        },
      ]),
    );
    const result = await new OsmAdapter().verify(input, { fetchFn });
    expect(result.signals.score).toBeGreaterThan(50);
    expect(result.normalized.city).toBe("MOUNTAIN VIEW");
    const [url] = fetchFn.mock.calls[0];
    expect(String(url)).toContain("nominatim.openstreetmap.org");
  });

  test("no match throws", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(Response.json([]));
    await expect(new OsmAdapter().verify(input, { fetchFn })).rejects.toThrow(
      "no match",
    );
  });
});
