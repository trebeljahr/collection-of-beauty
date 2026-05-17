import { ImageResponse } from "next/og";
import { summary } from "@/lib/data";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Pure typography card so the OG render doesn't depend on remote asset
// fetches at build time. Twitter/Facebook/LinkedIn all crop to 1.91:1
// (1200x630) for `summary_large_image`, so emitting that exact size
// removes any ambiguity in how scrapers downscale our preview.
export default function OpengraphImage() {
  const stats =
    `${summary.totalArtworks.toLocaleString()} works · ` +
    `${summary.totalArtists.toLocaleString()} artists · ` +
    `${summary.yearRange.min}–${summary.yearRange.max}`;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 80,
        background: "linear-gradient(135deg, #f7f3ec 0%, #ece4d4 55%, #d9c9ad 100%)",
        color: "#1a1208",
        fontFamily: "serif",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{ fontSize: 28, letterSpacing: 6, textTransform: "uppercase", color: "#7a5a2f" }}
        >
          A public-domain gallery
        </div>
        <div style={{ fontSize: 96, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          {SITE_NAME}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 36, lineHeight: 1.3, color: "#2c1f10", maxWidth: 980 }}>
          {SITE_TAGLINE}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            borderTop: "2px solid #7a5a2f",
            paddingTop: 18,
            fontSize: 26,
            color: "#3a2a16",
          }}
        >
          <span>{stats}</span>
          <span style={{ color: "#7a5a2f" }}>beauty.trebeljahr.com</span>
        </div>
      </div>
    </div>,
    size,
  );
}
