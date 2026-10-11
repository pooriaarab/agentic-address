import { describe, expect, test } from "vitest";
import {
  clampScore,
  localScore,
  normalizeAddress,
  normalizePostal,
  normalizeState,
  scoreToDeliverability,
} from "./normalize.js";

describe("normalize", () => {
  test("standardizes street, city, state, postal", () => {
    expect(
      normalizeAddress({
        street: " 1600 amphitheatre parkway ",
        line2: "suite 100",
        city: "mountain view",
        state: "California",
        postal: "940431234",
        country: "USA",
      }),
    ).toEqual({
      street: "1600 AMPHITHEATRE PKWY",
      line2: "STE 100",
      city: "MOUNTAIN VIEW",
      state: "CA",
      postal: "94043-1234",
      country: "US",
    });
  });

  test("keeps two-letter states and GB alias", () => {
    expect(normalizeState("ca", "US")).toBe("CA");
    expect(
      normalizeAddress({ street: "1 High Street", country: "UK" }).country,
    ).toBe("GB");
  });

  test("keeps ZIP+4 dash form", () => {
    expect(normalizePostal("94043-1234")).toBe("94043-1234");
    expect(normalizePostal(" 94043 ")).toBe("94043");
  });
});

describe("score", () => {
  test("full address scores high", () => {
    const signals = localScore({
      street: "1600 Amphitheatre Parkway",
      city: "Mountain View",
      state: "CA",
      postal: "94043",
    });
    expect(signals.score).toBeGreaterThanOrEqual(80);
    expect(signals.deliverability).toBe("deliverable");
  });

  test("empty street scores zero with a note", () => {
    const signals = localScore({ street: " " });
    expect(signals).toMatchObject({ score: 0, deliverability: "unknown" });
    expect(signals.notes.length).toBeGreaterThan(0);
  });

  test("missing fields lower the score with notes", () => {
    const signals = localScore({ street: "Main Street" });
    expect(signals.score).toBeLessThan(80);
    expect(signals.notes.length).toBeGreaterThan(0);
  });

  test("clamp and band edges", () => {
    expect(clampScore(140)).toBe(100);
    expect(clampScore(-4)).toBe(0);
    expect(scoreToDeliverability(80)).toBe("deliverable");
    expect(scoreToDeliverability(50)).toBe("risky");
    expect(scoreToDeliverability(10)).toBe("undeliverable");
    expect(scoreToDeliverability(0)).toBe("unknown");
  });
});
