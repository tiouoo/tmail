import { app } from "./worker/api.js";

// Vercel's Web Standard Node.js function; all browser API routes share one instance.
export default {
  fetch(request) {
    // Vercel runs without the Cloudflare proxy, so use its trusted client IP header.
    const headers = new Headers(request.headers);
    headers.set("CF-Connecting-IP", headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown");
    return app.fetch(new Request(request, { headers }), process.env);
  },
};
