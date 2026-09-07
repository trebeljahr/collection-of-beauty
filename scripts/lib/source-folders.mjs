// The source folders under assets/, in one place.
//
// Each has a metadata/<folder>.json sidecar in the shared envelope shape.
// Despite the historical name, not every folder is Wikimedia-sourced (the
// two Redouté folders are scraped from c82.net); the metadata schema is
// identical so they all flow through build-data's same pushFromFolder path.
//
// build-data.mjs and shrink-sources.mjs used to keep separate lists and the
// shrinker's was missing the Redouté folders, so `pnpm assets:prepare` never
// built variants for them — the ones that exist were produced by hand with
// `--folder`. Add a new folder here and both the shrinker and the catalogue
// pick it up.
export const SOURCE_FOLDERS = [
  "collection-of-beauty",
  "audubon-birds",
  "kunstformen-images",
  "redoute-lilies",
  "redoute-roses",
];
