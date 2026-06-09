#!/usr/bin/env node
/**
 * Scan src/data/artworks.json + metadata/collection-of-beauty.json for
 * records with suspect metadata: non-English descriptions, raw catalog
 * dumps, foreign-script-only titles, junk in the artist field, etc.
 *
 * Emits a JSON array on stdout — one entry per candidate, with everything
 * a fix-agent needs to produce a clean replacement (no extra disk reads).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ART = JSON.parse(readFileSync(path.join(ROOT, "src/data/artworks.json"), "utf8"));
const SIDECARS = {
  "collection-of-beauty": JSON.parse(
    readFileSync(path.join(ROOT, "metadata/collection-of-beauty.json"), "utf8"),
  ),
  "audubon-birds": JSON.parse(
    readFileSync(path.join(ROOT, "metadata/audubon-birds.json"), "utf8"),
  ),
  "kunstformen-images": JSON.parse(
    readFileSync(path.join(ROOT, "metadata/kunstformen-images.json"), "utf8"),
  ),
};

const DUTCH = /\b(Identificatie|Objecttype|Opschriften|Omschrijving|Vervaardiger|Catalogusreferentie|titel op object|Datering|Fysieke kenmerken|Materiaal|Techniek|Afmetingen|Verwerving|Plaats vervaardiging)\b/;
const GERMAN = /\b(Beschreibung|Künstler|Beschriftung|Sammlung|Inventarnummer|Maße|Standort|Datierung)\b/;
const FRENCH = /\b(Œuvre|Représentation|Conservée|Provenance|Lithographie|estampe|Description française|Représentant)\b/i;
const SPANISH = /\b(Obra moral|esqueletos|Muerte sobre|primer plano|escenas de|todas las|estamentos)\b/i;
const ITALIAN = /\b(quadro|opera|raffigura|conservato|Olio su tela)\b/i;
const CYRILLIC_HEAVY = /[Ѐ-ӿ]/;
const CJK = /[぀-ヿ一-鿿]/;
const RAW_CATALOG = /(?:Title\s+[A-Z][\w'\s]+\s+Object\s+Type|Creator\s+[A-Z]\w+,\s*[A-Z]\w+|Identificatie|Beschreibung|^Description\s+An?\s+oil|^Description\s+Title)/;
const BIOGRAPHICAL_ARTIST = /(?:Born in|Died in|Details on Google Art Project|Wikipedia Loves Art|Original uploader|You are free to use|GoldenArtists|Stephen_Sandoval|painter\s*\(Russian\)|painter\s*\(American\))/i;
const PLACEHOLDER_TITLE = /(?:^Albert Gleizes$|^Francis Picabia$|^Ivan Aivazovsky$|^Recoveredgleizes$|^WLA\s|^File:|^picabia[\s_]|^kunisada futamigaura$)/i;

function detectLanguageInDescription(desc) {
  if (!desc) return null;
  if (DUTCH.test(desc)) return "dutch";
  if (GERMAN.test(desc)) return "german";
  if (FRENCH.test(desc)) return "french";
  if (SPANISH.test(desc)) return "spanish";
  if (ITALIAN.test(desc)) return "italian";
  const cyrChars = (desc.match(/[Ѐ-ӿ]/g) || []).length;
  if (cyrChars > 30) return "russian";
  const cjkChars = (desc.match(CJK) || []).length;
  if (cjkChars > 30) return "cjk";
  return null;
}

function classifyTitle(title) {
  if (!title) return null;
  const latin = (title.match(/[A-Za-z]/g) || []).length;
  const cyr = (title.match(/[Ѐ-ӿ]/g) || []).length;
  const cjk = (title.match(CJK) || []).length;
  if (DUTCH.test(title)) return "dutch";
  if (latin === 0 && cyr > 0) return "cyrillic-only";
  if (latin === 0 && cjk > 0) return "cjk-only";
  if (latin > 0 && cyr > 0) return "bilingual-cyr";
  if (latin > 0 && cjk > 0 && cjk > 6) return "bilingual-cjk";
  if (PLACEHOLDER_TITLE.test(title)) return "placeholder";
  if (title.length > 80) return "very-long";
  return null;
}

function classifyArtist(artist) {
  if (!artist) return null;
  if (artist === "Rijksmuseum") return "museum-as-artist";
  if (artist.startsWith("w:")) return "wiki-prefix";
  if (BIOGRAPHICAL_ARTIST.test(artist)) return "biographical-tail";
  if (artist === "GoldenArtists" || artist === "Didier Descouens" || artist === "F.Bruni") return "uploader-or-shortform";
  if (artist.length > 60) return "overlong";
  return null;
}

const candidates = [];
for (const a of ART) {
  const sidecar = SIDECARS[a.folder];
  const fname = a.objectKey ? a.objectKey.replace(`${a.folder}/`, "") : null;
  const rawEntry = sidecar && fname ? sidecar.entries[fname] : null;

  const descLang = detectLanguageInDescription(a.description);
  const titleClass = classifyTitle(a.title);
  const artistClass = classifyArtist(a.artist);
  const hasRawCatalog = a.description && RAW_CATALOG.test(a.description);

  const issues = [];
  if (descLang) issues.push(`desc-${descLang}`);
  if (hasRawCatalog) issues.push("desc-raw-catalog");
  if (titleClass) issues.push(`title-${titleClass}`);
  if (artistClass) issues.push(`artist-${artistClass}`);
  // Description that's just a stub like "Claude Monet. Reflections of Clouds on the Water-Lily Pond. c."
  if (a.description && /\.\s*c\.?\s*$/i.test(a.description.trim()) && a.description.length < 100) {
    issues.push("desc-truncated");
  }

  if (issues.length === 0) continue;

  candidates.push({
    id: a.id,
    folder: a.folder,
    objectKey: a.objectKey,
    sidecarFilename: fname,
    rawTitle: a.title,
    rawArtist: a.artist,
    rawYear: a.year,
    rawEnglishTitle: a.englishTitle,
    rawDescription: a.description,
    rawDateCreated: a.dateCreated,
    sidecarRawTitle: rawEntry?.title ?? null,
    sidecarRawArtist: rawEntry?.artist ?? null,
    sidecarRawDescription: rawEntry?.description ?? null,
    sidecarRawDate: rawEntry?.date_created ?? null,
    commonsUrl: rawEntry?.source?.url ?? null,
    issues,
  });
}

process.stdout.write(JSON.stringify(candidates));
process.stderr.write(`scanned ${ART.length} artworks → ${candidates.length} candidates\n`);
const tally = {};
for (const c of candidates) for (const i of c.issues) tally[i] = (tally[i] || 0) + 1;
process.stderr.write(JSON.stringify(tally, null, 2) + "\n");
