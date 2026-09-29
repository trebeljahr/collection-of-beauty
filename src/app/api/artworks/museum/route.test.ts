import { expect, it } from "vitest";
import { catalogueListings } from "@/lib/data";
import { GET } from "./route";

it("delivers blur hashes with museum artwork data without enlarging the lightbox catalogue", async () => {
  const response = GET();
  const rows = await response.json();
  expect(rows).toHaveLength(catalogueListings.length);
  expect(rows.some((row: { thumbHash?: string }) => Boolean(row.thumbHash))).toBe(true);
  expect(catalogueListings.every((row) => !("thumbHash" in row))).toBe(true);
});
