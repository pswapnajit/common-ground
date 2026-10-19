import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.API_PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": `http://localhost:${apiPort}` },
  },
  build: { outDir: "dist", sourcemap: false },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
} as Parameters<typeof defineConfig>[0]);
