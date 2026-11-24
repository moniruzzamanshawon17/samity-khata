import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// The backend has no CORS headers, so in development the browser talks to
// Vite only and Vite forwards /api/* to FastAPI (same origin, no CORS needed).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const target = env.VITE_API_PROXY_TARGET || "http://localhost:8002";
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: { "/api": { target, changeOrigin: true } },
    },
    preview: {
      port: 4173,
      proxy: { "/api": { target, changeOrigin: true } },
    },
  };
});
