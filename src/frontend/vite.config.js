import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [
      react(),
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
