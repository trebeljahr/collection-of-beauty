// Worker entry. The runtime accepts only handlers as exports from this
// module, so the routing and its testable pieces live in router.ts.
import { type Context, type Env, handleRequest, withSecurityHeaders } from "./router";

export default {
  fetch: async (request: Request, env: Env, ctx: Context) =>
    withSecurityHeaders(await handleRequest(request, env, ctx)),
};
