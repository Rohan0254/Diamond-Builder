# Shopify app development

This app is scaffolded from a Shopify app template. See the README for framework-specific details.

Use the [Shopify AI Toolkit](https://shopify.dev/docs/apps/build/ai-toolkit) for all Shopify API and platform work. If missing, install it in the agent host per that page (or `npx skills add Shopify/shopify-ai-toolkit --list` for skill-compatible hosts) — do not add tooling to this repo.

## MongoDB performance

Apply these rules to every task in this project that touches the database:
- Reuse the shared Prisma client and its connection pool. Do not open or disconnect a client per request.
- Minimize database round trips and the data returned. Select only needed fields, bound or paginate large reads, and batch operations instead of querying inside loops.
- Design indexes around actual filters and sort orders on frequent queries. Reuse existing indexes and avoid redundant indexes that add write overhead. For expensive queries, check the execution plan against representative data when available.
- Keep database logic simple while preserving authorization, correctness, and consistency.
## Product requirements

For BYOR product work, follow the merchant and customer journey in [BYOR-REQUIREMENTS.md](./BYOR-REQUIREMENTS.md).
