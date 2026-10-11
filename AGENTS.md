# Agentic address agent guide

The SDK, CLI, and MCP server share verifyAddress.
Import core guards, errors, logging, and costs from agentic-core.
Keep agentic-core.d.ts unchanged as the contract reference.

Preview with vendor dry or live false.
A live keyed verify needs explicit authorization, a live flag, and a vendor key.
Require a street. Honor caps and the blocklist.
Keep vendor failures visible. Never claim a failed verify succeeded.

MCP tools: verify_address, batch_verify, get_cost_report.
Use verify_address for a preview first.
Read the cost report after dispatch.
Run build, typecheck, and tests before committing changes.
