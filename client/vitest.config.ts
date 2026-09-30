import nextEnvPkg from "@next/env";
import { defineConfig } from "vitest/config";

const { loadEnvConfig } = nextEnvPkg;

loadEnvConfig(process.cwd());

export default defineConfig({
  test: {
    exclude: [".next/**", "node_modules/**"],
    setupFiles: ["./vitest-setup.ts"],
  },
  resolve: {
    alias: { "~": import.meta.dirname },
  },
});
