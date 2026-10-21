import type { Logger } from "agentic-core";

export type AddressVendor =
  | "dry"
  | "local"
  | "smartystreets"
  | "lob"
  | "postgrid"
  | "osm";

export interface AddressInput {
  street: string;
  line2?: string;
  city?: string;
  state?: string;
  postal?: string;
  country?: string;
}

export interface NormalizedAddress {
  street: string;
  line2: string;
  city: string;
  state: string;
  postal: string;
  country: string;
}

export interface VerifySignals {
  deliverability: "deliverable" | "risky" | "undeliverable" | "unknown";
  score: number;
  residential: boolean | null;
  vacant: boolean | null;
  notes: string[];
}

export interface AdapterResult {
  normalized: NormalizedAddress;
  signals: VerifySignals;
  vendorId: string | null;
}

export interface AdapterContext {
  fetchFn?: typeof fetch;
  logger?: Logger;
}

export interface VerifyAdapter {
  readonly name: AddressVendor;
  readonly needsKey: boolean;
  verify(input: AddressInput, ctx: AdapterContext): Promise<AdapterResult>;
}

export interface AdapterOptions {
  apiKey?: string;
  authId?: string;
  baseUrl?: string;
}
