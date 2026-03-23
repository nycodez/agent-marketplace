FROM node:22-bookworm-slim

WORKDIR /workspace

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

COPY . .

RUN pnpm install

EXPOSE 3000

CMD ["pnpm", "--filter", "@agent-marketplace/web", "dev:docker"]
