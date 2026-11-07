import worker from "./index.js";
import { app } from "./api.js";
import { matchesPrivateEntry, privateCookie, privateHeaders, privateHtml, notFound } from './private.js';

// Local development serves the same API that Vercel hosts in production.
export default {
  ...worker,
  async fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return app.fetch(request, env, ctx);
    const path = new URL(request.url).pathname;
    if (path !== '/' && !path.startsWith('/assets/') && !path.startsWith('/mail/') && !['/favicon.svg', '/LICENSE.txt'].includes(path)) {
      if (!(await matchesPrivateEntry(request, env))) return notFound();
      const response = await env.ASSETS.fetch(new Request(new URL('/', request.url)));
      return new Response(privateHtml(await response.text()), { headers: {
        ...privateHeaders, 'Content-Type': 'text/html; charset=utf-8',
        'Set-Cookie': await privateCookie(request, env),
      } });
    }
    return env.ASSETS.fetch(request);
  },
};
