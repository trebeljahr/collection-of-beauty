// Legacy path for the site feed — kept so existing subscriber URLs don't
// break. Canonical feed lives at /rss.xml.
// Next can't statically analyze a re-exported route-segment-config, so
// `revalidate` must be a direct literal here (mirrors the canonical 3600).
export { GET } from "@/app/rss.xml/route";
export const revalidate = 3600;
