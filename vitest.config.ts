import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: { "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") },
  },
  test: {
    environment: "node",
    // O banco de teste é compartilhado: arquivos rodam em sequência
    fileParallelism: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          setupFiles: ["tests/setup-db.ts"],
          testTimeout: 20000,
          hookTimeout: 30000,
        },
      },
    ],
  },
});
