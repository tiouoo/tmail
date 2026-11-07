import { app } from "./worker/api.js";
import { readFile } from 'node:fs/promises';
import { matchesPrivateEntry, privateCookie, privateHeaders, privateHtml, notFound } from './worker/private.js';

// Vercel's Web Standard Node.js function; all browser API routes share one instance.
export default {
  async fetch(request) {
    if (!new URL(request.url).pathname.startsWith('/api/')) {
      if (!(await matchesPrivateEntry(request, process.env))) return notFound();
      const html = privateHtml(await readFile(`${process.cwd()}/src/frontend/dist/index.html`, 'utf8'));
      return new Response(request.method === 'HEAD' ? null : html, { headers: {
        ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': await privateCookie(request, process.env),
      } });
    }
    // Vercel runs without the Cloudflare proxy, so use its trusted client IP header.
    const headers = new Headers(request.headers);
    headers.set("CF-Connecting-IP", headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    return app.fetch(new Request(request, { headers }), process.env);
  },
};
