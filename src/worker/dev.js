import worker from "./index.js";
import { app } from "./api.js";

// Local development serves the same API that Vercel hosts in production.
export default {
  ...worker,
  fetch(request, env, ctx) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return app.fetch(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
