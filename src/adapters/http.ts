import { AdapterError } from "./error.js";
import type { AdapterContext } from "./types.js";

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export async function fetchJson(
  name: string,
  url: string,
  key: string | undefined,
  options: FetchOptions,
  ctx: AdapterContext,
): Promise<unknown> {
  if (key !== undefined && !key.trim()) {
    throw new AdapterError(`${name}: missing API key`);
  }
  let response: Response;
  try {
    response = await (ctx.fetchFn ?? globalThis.fetch)(url, {
      method: options.method ?? "GET",
      headers: options.headers,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
  } catch (cause) {
    throw new AdapterError(`${name}: network error`, { cause });
  }
  if (!response.ok) {
    throw new AdapterError(`${name}: HTTP ${response.status}`, {
      status: response.status,
    });
  }
  try {
    return (await response.json()) as unknown;
  } catch (cause) {
    throw new AdapterError(`${name}: invalid response`, { cause });
  }
}

export function basicAuth(user: string, password = ""): string {
  const token =
    typeof Buffer !== "undefined"
      ? Buffer.from(`${user}:${password}`).toString("base64")
      : btoa(`${user}:${password}`);
  return `Basic ${token}`;
}
