---
name: agentic-address
description: Verify postal addresses with SmartyStreets, Lob, PostGrid, or open validators.
---

# Agentic address

Use `npx agentic-address verify` with a street and any known parts.
Start with a preview. Keyed vendors preview by default without a network call.
For live dispatch, obtain explicit user authorization and use --live.
Read vendor API keys from the environment.
Use batch with --in and --out to clean a CSV list.
Honor caps and the blocklist. Stop on a guard denial.
Report adapter errors as failures.
Run `npx agentic-address costs` after dispatch.
MCP clients use verify_address, batch_verify, and get_cost_report.
