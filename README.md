# Agent Marketplace

Standalone agent operating system for defining agent teams, installing integrations, publishing agent program files to Base and Arweave, supervising runs, and approving external actions.

Temporal is the orchestration boundary for agent runs and publication flows.

Slack is a first-class communication integration: install it once at the organization level, grant scoped Slack tools to specific agents, and the run planner will only schedule Slack actions when both the install and the grant are present.

Model providers can be customer-owned paid APIs or a free local Ollama connection. The default local Docker option runs `qwen2.5:0.5b` through Ollama for low-cost planning and drafting.

## Workspace

- `apps/web`: Next.js product UI
- `apps/api`: Fastify TypeScript API
- `apps/worker`: Temporal worker runtime
- `packages/contracts`: shared typed contracts and zod schemas
- `packages/config`: environment helpers
- `packages/database`: PostgreSQL migration runner and baseline SQL schema
- `packages/integrations`: provider catalog and connector metadata
- `packages/agent-runtime`: deterministic provisioning and run-planning helpers
- `packages/ui`: shared React primitives and theme helpers

## First-Class Publishing

Program files are modeled as workspace resources and can be published to:

- `Base` for chain-visible registries and manifests
- `Arweave` for immutable permanent storage and retrieval

The initial scaffold includes typed contracts, API endpoints, worker queue scaffolding, integration metadata, and product UI for these publication targets.

## Orchestration

- Agent runs are scheduled through Temporal workflows.
- Program-file publication to Base and Arweave is also scheduled through Temporal.
- The API stores workflow metadata on run and publication records so Temporal state is visible in the product.

## Local Startup

One command starts the full local stack:

```bash
pnpm dev
```

That brings up:

- `web` on `http://localhost:3000`
- `api` on `http://localhost:4001`
- `Temporal UI` on `http://localhost:8080`
- `postgres` on `localhost:55432`
- `redis` on `localhost:6379`
- `ollama` on `http://localhost:11434`

Useful commands:

```bash
pnpm dev:logs
pnpm dev:down
pnpm dev:clean
pnpm db:migrate
pnpm db:migrate:status
```

The direct host processes still exist for non-container workflows:

```bash
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

## Theme

The product uses a strict monochrome theme:

- light mode: black text on white surfaces
- dark mode: white text on black surfaces

## Status

This implementation now includes PostgreSQL-backed API persistence, Temporal worker orchestration, containerized local startup, provider-specific integration flows, and both paid and local model-provider options. Some provider execution adapters are still scaffolded, but the app is no longer using an in-memory-only API store.

## Migrations

The PostgreSQL migration system now lives in [packages/database](/Users/agonzales/Containers/roamstay/agent-marketplace/packages/database). It keeps ordered SQL migrations in [migrations](/Users/agonzales/Containers/roamstay/agent-marketplace/packages/database/migrations) and records applied files in a `schema_migrations` table.

Run the baseline schema:

```bash
pnpm db:migrate
```

Check applied vs pending migrations:

```bash
pnpm db:migrate:status
```

Create the next migration file:

```bash
pnpm db:migrate:create "add persistent sessions"
```
