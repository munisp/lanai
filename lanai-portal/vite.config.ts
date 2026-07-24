import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const plugins = [react(), tailwindcss(), jsxLocPlugin()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/wouter/")
          )
            return "react-core";
          if (id.includes("/@radix-ui/") || id.includes("/lucide-react/"))
            return "ui-vendor";
          if (id.includes("/@trpc/") || id.includes("/@tanstack/"))
            return "data-vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3001,
    strictPort: true, // Port 3000 is used by Twenty CRM
    host: true,
    proxy: {
      "/api/proposals": {
        target: "http://localhost:5556",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/proposals/, "/api"),
      },
      "/api/intelligence": {
        target: "http://localhost:5557",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/intelligence/, "/api"),
      },
      "/api/briefing": {
        target: "http://localhost:5558",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/briefing/, "/api"),
      },
      "/api/whatsapp": {
        target: "http://localhost:5555",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/whatsapp/, ""),
      },
      "/crm": {
        target: process.env.TWENTY_CRM_URL ?? "http://localhost:3000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/crm/, ""),
        configure: (proxy) => {
          const CRM_TOKEN = process.env.TWENTY_CRM_API_TOKEN ?? "";
          proxy.on("proxyReq", (proxyReq) => {
            if (CRM_TOKEN)
              proxyReq.setHeader("Authorization", `Bearer ${CRM_TOKEN}`);
          });
        },
      },
    },
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
