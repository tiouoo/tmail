import worker from "./index.js";

// Local development serves the same API that Vercel hosts in production.
export default {
  ...worker,
  fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return worker.fetch(request, env, ctx);
    if (pathname === "/" || pathname === "/domains" || pathname === "/domains/" ||
      pathname.startsWith("/assets/") || pathname.startsWith("/mail/") ||
      ["/favicon.svg", "/LICENSE.txt"].includes(pathname)) return env.ASSETS.fetch(request);
    return new Response("Not Found", { status: 404 });
  },
};
