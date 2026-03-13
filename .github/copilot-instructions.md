# draw-steel-downtime-project-tracker — Copilot Instructions

Foundry VTT V13 module for Draw Steel downtime project tracking. See ARCHITECTURE.md for design details.

## Stack
- Foundry VTT V13 module (JavaScript ESM)
- Module manifest: `module.json`
- Source: `scripts/` (ESM modules)
- Templates: `templates/` (Handlebars)
- Styles: `styles/`
- Localization: `lang/en.json`

## Conventions
- Follow Foundry VTT V13 API patterns
- Use the MCP server's `generate_downtime_project` tool to create test project data
- Reference `reference/` for Draw Steel project rules
