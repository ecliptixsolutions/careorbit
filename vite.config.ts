import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tsconfigPaths(),
    tanstackStart({ autoCodeSplitting: true, server: { entry: "server" } }),
    nitro(),
    react(),
  ],
  server: {
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: true } },
  },
});
