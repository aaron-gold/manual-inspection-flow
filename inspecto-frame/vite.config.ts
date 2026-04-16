import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
const uveyeProxy = {
  "/uveye-api": {
    target: "https://us.api.uveye.app",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/uveye-api/, ""),
    secure: true,
  },
} as const;

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    /** Same-origin proxy so browser fetch can send `uveye-api-key` without CORS blocking. */
    proxy: { ...uveyeProxy },
  },
  preview: {
    proxy: { ...uveyeProxy },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
