// Errors thrown on the /adapters path. They are defined here, not in
// agentic-core, so the Workers bundle never pulls the core entry (which
// imports crypto and module). AdapterError mirrors VendorError's shape
// (`code: "VENDOR_FAILED"`, optional `status`); GuardError mirrors
// agentic-core's GuardError (`code: "GUARD_DENIED"`).

export class AdapterError extends Error {
  readonly code = "VENDOR_FAILED" as const;
  readonly status?: number;
  constructor(
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "AdapterError";
    this.status = options.status;
  }
}

export class GuardError extends Error {
  readonly code = "GUARD_DENIED" as const;
  constructor(message: string) {
    super(message);
    this.name = "GuardError";
  }
}
