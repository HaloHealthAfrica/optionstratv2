import { defineConfig } from "npm:vitest@3.2.4/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist"],
  },
});
