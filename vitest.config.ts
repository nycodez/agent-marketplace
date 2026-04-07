import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@agent-marketplace/contracts": path.resolve(root, "packages/contracts/src/index.ts"),
      "@agent-marketplace/config": path.resolve(root, "packages/config/src/index.ts"),
      "@agent-marketplace/integrations": path.resolve(root, "packages/integrations/src/index.ts"),
      "@agent-marketplace/agent-runtime": path.resolve(root, "packages/agent-runtime/src/index.ts"),
      "@agent-marketplace/database": path.resolve(root, "packages/database/src/index.ts"),
      "@agent-marketplace/ui": path.resolve(root, "packages/ui/src/index.tsx"),
    },
  },
});
