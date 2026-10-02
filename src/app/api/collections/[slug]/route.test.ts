import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("collection ZIP cache policy", () => {
  it("does not return a stale 304 when a variant changes at the same URL", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/collections/redoute-les-roses", {
        headers: { "if-none-match": 'W/"redoute-les-roses-960-169"' },
      }),
      { params: Promise.resolve({ slug: "redoute-les-roses" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("etag")).toBeNull();
    await response.body?.cancel();
  });
});
