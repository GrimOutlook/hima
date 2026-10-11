import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/hima/" : "/",
  plugins: [react(), {
    name: "pages-content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: () => mode === "pages" ? [{
        tag: "meta",
        attrs: {
          "http-equiv": "Content-Security-Policy",
          // Mirror nginx's policy except frame-ancestors, which meta CSP cannot enforce.
          content: "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
        },
        injectTo: "head-prepend",
      }] : [],
    },
  }],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/auth": "http://127.0.0.1:3000",
    },
  },
  test: {
    environment: "node",
  },
}));
