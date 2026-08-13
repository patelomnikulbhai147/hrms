import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "frontend/src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  // Strip developer logging from PRODUCTION bundles only.
  //
  // 31 `console.log` calls were shipping to users — noise in their console, and
  // several print request payloads and workspace ids. Dropped at build time
  // rather than deleted from source, so local development keeps every log and no
  // 31-file mechanical edit is needed. `console.error`/`warn` are deliberately
  // KEPT: real failures must still surface in a production browser console.
  esbuild: {
    drop: process.env.NODE_ENV === "production" ? ["debugger"] : [],
    pure: process.env.NODE_ENV === "production" ? ["console.log", "console.debug", "console.info"] : [],
  },
  build: {
    // Split heavy, rarely-changing libraries into their own chunks so the
    // browser caches them across deploys and the initial route loads less JS.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom"],
          "vendor-charts": ["recharts"],
          "vendor-export": ["xlsx", "jspdf", "jspdf-autotable", "jszip"],
          "vendor-canvas": ["html2canvas", "html2canvas-pro"],
          "vendor-motion": ["framer-motion"],
        },
      },
    },
  },
});
