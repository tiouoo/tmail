import { fileURLToPath } from "node:url";
import { defineConfig, normalizePath, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import devServer from "@hono/vite-dev-server";
import { readFile } from 'node:fs/promises';
import { matchesPrivateEntry, privateCookie, privateHeaders, privateHtml } from '../worker/private.js';

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return {
    root: fileURLToPath(new URL(".", import.meta.url)),
    plugins: [
      react(),
      { name: 'private-inbox-entry', apply: 'serve', configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = (req.url || '/').split('?')[0];
          if (path === '/' || /^\/(?:api|mail|src|assets|node_modules|@)[/\w-]*/.test(path) || ['/favicon.svg', '/LICENSE.txt'].includes(path)) return next();
          try {
            const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method });
            for (const [key, value] of Object.entries(privateHeaders)) res.setHeader(key, value);
            if (!(await matchesPrivateEntry(request, env))) { res.statusCode = 404; res.end('Not Found'); return; }
            res.setHeader('Set-Cookie', await privateCookie(request, env));
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            const html = await readFile(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8');
            res.end(privateHtml(await server.transformIndexHtml('/', html)));
          } catch { res.statusCode = 503; res.end('Service Unavailable'); }
        });
      } },
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
