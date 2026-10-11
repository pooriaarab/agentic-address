import type {
  AdapterContext,
  AdapterResult,
  AddressInput,
  VerifyAdapter,
} from "./types.js";
import { localScore, normalizeAddress } from "../normalize.js";

export class DryAdapter implements VerifyAdapter {
  readonly name = "dry" as const;
  readonly needsKey = false;

  async verify(
    input: AddressInput,
    _ctx: AdapterContext = {},
  ): Promise<AdapterResult> {
    return {
      normalized: normalizeAddress(input),
      signals: { ...localScore(input), notes: ["dry run: no vendor call"] },
      vendorId: null,
    };
  }
}

export class LocalAdapter implements VerifyAdapter {
  readonly name = "local" as const;
  readonly needsKey = false;

  async verify(
    input: AddressInput,
    _ctx: AdapterContext = {},
  ): Promise<AdapterResult> {
    return {
      normalized: normalizeAddress(input),
      signals: localScore(input),
      vendorId: null,
    };
  }
}
