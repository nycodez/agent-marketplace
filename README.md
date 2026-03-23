# Agent Marketplace

Standalone agent operating system for defining agent teams, installing integrations, publishing agent program files to Base and Arweave, supervising runs, and approving external actions.

Temporal is the orchestration boundary for agent runs and publication flows.

## Workspace

- `apps/web`: Next.js product UI
- `apps/api`: Fastify TypeScript API
- `apps/worker`: Temporal worker runtime
- `packages/contracts`: shared typed contracts and zod schemas
- `packages/config`: environment helpers
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

## Theme

The product uses a strict monochrome theme:

- light mode: black text on white surfaces
- dark mode: white text on black surfaces

## Status

This initial implementation provides the repo structure, core contracts, a bootstrap API with in-memory persistence, a worker scaffold, and a Next.js app shell wired to the same domain model. PostgreSQL and Redis remain the intended production infrastructure and are represented in the shared config and worker queue code.
