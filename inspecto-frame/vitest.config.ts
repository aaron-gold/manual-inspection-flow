import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import { resolveAppEnvDefine } from "./build-info";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  define: resolveAppEnvDefine(projectRoot),
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(projectRoot, "./src") },
  },
});
