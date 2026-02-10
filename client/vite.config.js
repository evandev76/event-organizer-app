import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy API to the prod-refactor backend.
      "/api": "http://127.0.0.1:5173",
    },
  },
});

