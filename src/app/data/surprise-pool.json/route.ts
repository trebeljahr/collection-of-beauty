import { SURPRISE_POOL } from "@/lib/surprise-pool";

export const dynamic = "force-static";

/** What `/surprise` draws from, sampled in the browser. */
export function GET() {
  return Response.json(SURPRISE_POOL);
}
