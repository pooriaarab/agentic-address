import type {
  AddressInput,
  NormalizedAddress,
  VerifySignals,
} from "./adapters/types.js";

const SUFFIXES: Record<string, string> = {
  STREET: "ST",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  DRIVE: "DR",
  LANE: "LN",
  ROAD: "RD",
  COURT: "CT",
  CIRCLE: "CIR",
  PLACE: "PL",
  TERRACE: "TER",
  PARKWAY: "PKWY",
  HIGHWAY: "HWY",
  TRAIL: "TRL",
  PLAZA: "PLZ",
  SQUARE: "SQ",
  ALLEY: "ALY",
  CROSSING: "XING",
};

const DIRECTIONS: Record<string, string> = {
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  NORTHEAST: "NE",
  NORTHWEST: "NW",
  SOUTHEAST: "SE",
  SOUTHWEST: "SW",
};

const SECONDARY: Record<string, string> = {
  APARTMENT: "APT",
  SUITE: "STE",
  UNIT: "UNIT",
  FLOOR: "FL",
  BUILDING: "BLDG",
};

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function upper(value: string | undefined): string {
  return clean(value).toUpperCase();
}

export function normalizeStreet(street: string): string {
  const words = upper(street).split(" ").filter(Boolean);
  return words
    .map((word, index) => {
      const stripped = word.replace(/[.,#]/g, "");
      if (index === words.length - 1 && SUFFIXES[stripped]) {
        return SUFFIXES[stripped];
      }
      if (DIRECTIONS[stripped]) return DIRECTIONS[stripped];
      if (SECONDARY[stripped]) return SECONDARY[stripped];
      return stripped;
    })
    .join(" ");
}

export function normalizeLine2(line2: string | undefined): string {
  const words = upper(line2).split(" ").filter(Boolean);
  return words
    .map((word) => {
      const stripped = word.replace(/[.,#]/g, "");
      return SECONDARY[stripped] ?? stripped;
    })
    .join(" ");
}

export function normalizeCity(city: string | undefined): string {
  return upper(city).replace(/[.,]/g, "");
}

export function normalizeState(
  state: string | undefined,
  country: string | undefined,
): string {
  const value = upper(state);
  if (!value) return "";
  const code = country ? upper(country) : "";
  if (code === "" || code === "US" || code === "USA") {
    const names: Record<string, string> = {
      CALIFORNIA: "CA",
      TEXAS: "TX",
      FLORIDA: "FL",
      "NEW YORK": "NY",
      ILLINOIS: "IL",
      WASHINGTON: "WA",
      OREGON: "OR",
      NEVADA: "NV",
      ARIZONA: "AZ",
      COLORADO: "CO",
    };
    if (value.length === 2) return value;
    return names[value] ?? value;
  }
  return value;
}

export function normalizePostal(postal: string | undefined): string {
  const value = upper(postal).replace(/\s+/g, "");
  const zip9 = value.match(/^(\d{5})-?(\d{4})$/);
  if (zip9) return `${zip9[1]}-${zip9[2]}`;
  return value;
}

export function normalizeCountry(country: string | undefined): string {
  const value = upper(country);
  if (value === "USA" || value === "UNITED STATES") return "US";
  if (value === "UK" || value === "GREAT BRITAIN") return "GB";
  return value;
}

export function normalizeAddress(input: AddressInput): NormalizedAddress {
  const country = normalizeCountry(input.country);
  return {
    street: normalizeStreet(input.street),
    line2: normalizeLine2(input.line2),
    city: normalizeCity(input.city),
    state: normalizeState(input.state, country),
    postal: normalizePostal(input.postal),
    country,
  };
}

export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreToDeliverability(
  score: number,
): VerifySignals["deliverability"] {
  if (score >= 80) return "deliverable";
  if (score >= 50) return "risky";
  if (score > 0) return "undeliverable";
  return "unknown";
}

export function localScore(input: AddressInput): VerifySignals {
  const notes: string[] = [];
  let score = 0;
  const street = clean(input.street);
  if (!street) {
    notes.push("street is empty");
    return { deliverability: "unknown", score: 0, residential: null, vacant: null, notes };
  }
  score += 25;
  if (/\d/.test(street)) {
    score += 15;
  } else {
    notes.push("street has no house number");
  }
  if (clean(input.city)) {
    score += 15;
  } else {
    notes.push("city is missing");
  }
  if (clean(input.state)) {
    score += 10;
  } else {
    notes.push("state is missing");
  }
  const postal = normalizePostal(input.postal);
  if (/^\d{5}(-\d{4})?$/.test(postal)) {
    score += 25;
  } else if (postal) {
    score += 10;
    notes.push("postal code is not a US ZIP");
  } else {
    notes.push("postal code is missing");
  }
  if (clean(input.line2)) score += 10;
  const finalScore = clampScore(score);
  return {
    deliverability: scoreToDeliverability(finalScore),
    score: finalScore,
    residential: null,
    vacant: null,
    notes,
  };
}
