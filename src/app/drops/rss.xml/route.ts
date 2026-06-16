// Legacy path for the site feed — kept so existing subscriber URLs don't
// break. Canonical feed lives at /rss.xml.
export { GET, revalidate } from "@/app/rss.xml/route";
