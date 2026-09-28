// Google Art Project imports on Wikimedia Commons, matched by file name
// ("… - Google Art Project.jpg", or with underscores). Their
// `pretty_dimensions` field sometimes gives millimetres labelled as cm.
// Shared between:
//   - scripts/build-data.mjs (divides a value over 400 cm by 10, on these
//     files only)
//   - src/lib/real-size.ts   (which template values may be drawn to scale)
//
// Lives as `.mjs` for the same reason as variant-config.mjs: the build
// script imports it untranspiled. If the two sides disagreed, a rescaled
// size would either be hidden or a real 5 m fresco would shrink tenfold.
export const GOOGLE_ART_PROJECT = /google[_ ]art[_ ]project/i;
