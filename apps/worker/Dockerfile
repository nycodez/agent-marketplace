FROM node:22-bookworm-slim

WORKDIR /workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY . .

RUN pnpm install

CMD ["pnpm", "--filter", "@agent-marketplace/worker", "dev"]
