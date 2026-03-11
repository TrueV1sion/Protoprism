import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/__tests__/**/*.test.ts"],
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
      exclude: [
        "src/generated/**",
        "src/lib/prisma.ts",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
