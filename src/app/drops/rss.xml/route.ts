// Legacy path for the site feed — kept so existing subscriber URLs don't
// break. Canonical feed lives at /rss.xml. Next can't statically analyze
// a re-exported route-segment-config, so `dynamic` is a literal here.
export { GET } from "@/app/rss.xml/route";
export const dynamic = "force-static";
