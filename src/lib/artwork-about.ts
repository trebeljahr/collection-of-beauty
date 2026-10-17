import { originalTitleSubtitle } from "@/lib/artwork-format";
import { type Artwork, getArtist, getArtwork } from "@/lib/data";
import { assignEra, getEra } from "@/lib/gallery-eras";
import { getLicenseInfo } from "@/lib/license";
import { holdingSentence, plateNumberFor, plateSetForArtwork } from "@/lib/plate-sets";
import { formatCm, trustworthyRealSize } from "@/lib/real-size";
import { sourceLabel } from "@/lib/source-label";

/**
 * What the /artwork/[id] page's aside says about a work, as plain data,
 * for the 3D museum's "More about this painting" pill. Served one work at
 * a time by /api/artwork-about/[id] and fetched only when a visitor opens
 * the pill, so none of it rides in the museum's listings payload:
 * descriptions alone are most of the full catalogue's ~6 MB.
 *
 * Client code imports this module's type only (`import type`): the
 * builder reads the full catalogue and must stay on the server.
 */
export type ArtworkAbout = {
  id: string;
  /** Original-language title, when the shown title is a translation. */
  originalTitle: string | null;
  artist: string | null;
  artistSlug: string | null;
  lifespan: string | null;
  dateCreated: string | null;
  originalDateString: string | null;
  era: { id: string; title: string } | null;
  plate: { id: string; title: string; number: number | null; sentence: string } | null;
  license: { short: string; url: string; isPublicDomain: boolean };
  source: { url: string; label: string };
  description: string;
};

export function artworkAbout(id: string): ArtworkAbout | null {
  const art = getArtwork(id);
  if (!art) return null;
  const artist = art.artistSlug ? getArtist(art.artistSlug) : null;
  const eraId = assignEra({ movement: art.movement, year: art.year });
  const era = eraId ? getEra(eraId) : null;
  const plateSet = plateSetForArtwork(art);
  const plateNumber = plateSet ? plateNumberFor(art.id, plateSet.id) : null;
  return {
    id: art.id,
    originalTitle: originalTitleSubtitle(art),
    artist: art.artist,
    artistSlug: art.artistSlug,
    lifespan: artist?.born && artist?.died ? `${artist.born}–${artist.died}` : null,
    dateCreated: art.dateCreated,
    originalDateString:
      art.originalDateString && art.originalDateString !== art.dateCreated
        ? art.originalDateString
        : null,
    era: era ? { id: era.id, title: era.title } : null,
    plate: plateSet
      ? {
          id: plateSet.id,
          title: plateSet.title,
          number: plateNumber,
          sentence: `${plateNumber != null ? `Plate ${plateNumber} of` : "From"} ${plateSet.title}, ${plateSet.author}, ${plateSet.publishedLabel}. ${holdingSentence(plateSet)}`,
        }
      : null,
    license: getLicenseInfo(art.license),
    source: { url: art.commonsUrl, label: sourceLabel(art.commonsUrl) },
    description: art.description ?? generatedByline(art),
  };
}

/** Used as a description fallback when the source had no description.
 *  Composes a short factual sentence from the fields we always have so
 *  every detail page has SOME prose under the title. */
export function generatedByline(a: Artwork): string {
  const parts: string[] = [];
  if (a.artist && a.year) {
    parts.push(`Painted by ${a.artist} in ${a.year}.`);
  } else if (a.artist) {
    parts.push(`Work by ${a.artist}.`);
  } else if (a.year) {
    parts.push(`Created in ${a.year}.`);
  }
  if (a.movement) {
    parts.push(`Part of the ${a.movement} movement.`);
  }
  // The audited size only, so the prose matches the scale view below it.
  const realSize = trustworthyRealSize(a);
  if (realSize) parts.push(`Original dimensions ${formatCm(realSize)}.`);
  return parts.length > 0
    ? parts.join(" ")
    : "From the Collection of Beauty — a public-domain art gallery.";
}
