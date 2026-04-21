import artworksJson from "@/data/artworks.json";
import artistsJson from "@/data/artists.json";
import movementsJson from "@/data/movements.json";
import connectionsJson from "@/data/connections.json";
import summaryJson from "@/data/summary.json";

export type Artwork = {
  id: string;
  title: string;
  artist: string | null;
  artistSlug: string;
  year: number | null;
  dateCreated: string | null;
  description: string | null;
  folder: string;
  objectKey: string;
  width: number | null;
  height: number | null;
  realDimensions: {
    widthCm: number;
    heightCm: number;
    source: "wikidata" | "wikimedia-template" | "static";
  } | null;
  /** Widths (in px) for which a pre-built variant exists under
   *  assets-web/<folder>/<basename>/<width>.{avif,webp}. Emitted by
   *  `pnpm build:data` at build time; consumers use it to avoid
   *  attempting fetches for variants that don't exist yet. `null` when
   *  nothing has been shrunk for this artwork. */
  variantWidths: number[] | null;
  fileUrl: string;
  commonsUrl: string;
  credit: string | null;
  license: string;
  movement: string | null;
  nationality: string | null;
};

export type Artist = {
  slug: string;
  name: string;
  born: number | null;
  died: number | null;
  nationality: string | null;
  movement: string | null;
  count: number;
  minYear: number | null;
  maxYear: number | null;
  coverFileUrl: string | null;
  coverObjectKey: string | null;
  coverTitle: string | null;
};

export type Connection = {
  source: string;
  target: string;
  label: string;
  kind: "known" | "movement";
};

export const artworks = artworksJson as Artwork[];
export const artists = artistsJson as Artist[];
export const movements = movementsJson as string[];
export const connections = connectionsJson as Connection[];
export const summary = summaryJson as {
  totalArtworks: number;
  totalArtists: number;
  totalMovements: number;
  totalConnections: number;
  yearRange: { min: number | null; max: number | null };
};

export function getArtwork(id: string): Artwork | null {
  return artworks.find((a) => a.id === id) ?? null;
}

export function getArtist(slug: string): Artist | null {
  return artists.find((a) => a.slug === slug) ?? null;
}

export function getArtworksByArtist(slug: string): Artwork[] {
  return artworks.filter((a) => a.artistSlug === slug);
}

export function getConnectionsFor(slug: string): Connection[] {
  return connections.filter((c) => c.source === slug || c.target === slug);
}
