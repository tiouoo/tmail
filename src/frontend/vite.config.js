import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";
import config from "../../config.js";

const htmlEntities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    define: {
      __PUBLIC_CONFIG__: JSON.stringify({ name: config.name, inboxPolling: config.inboxPolling }),
    },
    plugins: [
      react(),
      {
        name: "site-name",
        transformIndexHtml(html) {
          const name = config.name.replace(/[&<>"']/g, (char) => htmlEntities[char]);
          return html.replaceAll("%SITE_NAME%", () => name);
        },
      },
      ...(command === "serve"
        ? [
            devServer({
              // Serve the same API as Vercel, without a second local server.
              entry: normalizePath(
                fileURLToPath(new URL("../worker/api.js", import.meta.url)),
              ),
              export: "app",
              adapter: { env },
              injectClientScript: false,
              exclude: [/^(?!\/api(?:\/|$))/],
            }),
          ]
        : []),
    ],
    build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
    server: {
      fs: {
        deny: [
          "**/.git/**",
          "**/.env*",
          "**/.dev.vars*",
          "**/config.js",
          "**/src/worker/**",
          "**/src/settings.js",
        ],
      },
    },
  };
});
