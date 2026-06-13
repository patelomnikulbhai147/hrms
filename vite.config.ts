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
      "@": path.resolve(__dirname, "src"),
    },
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
