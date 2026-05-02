// Pass 3: rewrite Japanese era-name dates in the wikimedia source metadata
// to plain Gregorian years.
//
// Source data has strings like "大正15年出版" (Taishō 15, published) or
// "昭和5年頃" (around Shōwa 5) in the date_created field, which leak through
// to the gallery UI. The year field is already extracted correctly upstream;
// this pass updates date_created so it reads as English/Gregorian, and fills
// any null year fields the era was the only signal for (notably 元 = year 1).
//
// Regex: /(明治|大正|昭和|平成|令和)\s*(\d+|元)\s*年/
// The era counts inclusively, so year N = eraStart + N - 1; 元 is year 1.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const META = path.join(ROOT, "metadata");

const FOLDERS = ["collection-of-beauty", "audubon-birds", "kunstformen-images"];

const ERA_START = {
  明治: 1868, // Meiji
  大正: 1912, // Taishō
  昭和: 1926, // Shōwa
  平成: 1989, // Heisei
  令和: 2019, // Reiwa
};

const ERA_RX = /(明治|大正|昭和|平成|令和)\s*(\d+|元)\s*年/g;

function convertEraToYear(era, n) {
  const start = ERA_START[era];
  if (start == null) return null;
  const num = n === "元" ? 1 : Number(n);
  if (!Number.isFinite(num) || num <= 0) return null;
  return start + num - 1;
}

// Translate / strip the publishing-context phrases that travel with these
// dates on Japanese ukiyo-e and shin-hanga records.
const PHRASE_REPLACEMENTS = [
  [/出版/g, ""], // "published" — already implied by being a date
  [/出品/g, "(exhibited)"], // "exhibited / submitted"
  [/頃/g, "(circa)"], // "around / circa"
  [/第\s*(\d+)\s*回\s*文展/g, "(Bunten Exhibition $1)"], // 文展 = Ministry of Education Art Exhibition
  [/東京勧業博覧会/g, "(Tokyo Industrial Exposition)"],
];

function rewriteDateCreated(raw) {
  if (typeof raw !== "string") return [raw, null];
  let cleaned = raw.replace(ERA_RX, (_m, era, n) => {
    const y = convertEraToYear(era, n);
    return y == null ? _m : String(y);
  });
  if (cleaned === raw) return [raw, null];
  for (const [rx, repl] of PHRASE_REPLACEMENTS) cleaned = cleaned.replace(rx, repl);
  // "(circa)" + bare year reads better as "circa <year>".
  cleaned = cleaned.replace(/(\d{4})\s*\(circa\)/g, "circa $1");
  // Insert a space between a digit/letter and a following "(", and merge
  // adjacent ")(" parentheticals into a single comma-separated note so
  // "1907(Tokyo Industrial Exposition)(exhibited)" reads as
  // "1907 (Tokyo Industrial Exposition, exhibited)".
  cleaned = cleaned.replace(/([\w\d])(\()/g, "$1 $2");
  cleaned = cleaned.replace(/\)\s*\(/g, ", ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // Collapse stray punctuation left from stripped Japanese phrases.
  cleaned = cleaned.replace(/\s+,/g, ",").replace(/,\s*$/g, "").trim();
  return [cleaned, raw];
}

function maybeFillYear(entry, gregorian) {
  if (typeof entry.year === "number") return false;
  entry.year = gregorian;
  if (!entry.year_source) entry.year_source = "era_conversion";
  return true;
}

let totalDateRewrites = 0;
let totalYearFills = 0;
const samples = [];

for (const folder of FOLDERS) {
  const file = path.join(META, `${folder}.json`);
  const meta = JSON.parse(await readFile(file, "utf8"));
  let folderDate = 0;
  let folderYear = 0;

  for (const [_fname, entry] of Object.entries(meta.entries ?? {})) {
    const [newDate, oldDate] = rewriteDateCreated(entry.date_created);
    if (oldDate != null && newDate !== oldDate) {
      entry.date_created = newDate;
      folderDate++;
      totalDateRewrites++;
      // First Gregorian year that appears in the cleaned string is the
      // canonical creation year. Fall back to filling year if absent.
      const m = String(newDate).match(/\b(1[6-9]\d{2}|20\d{2})\b/);
      if (m) {
        const yr = Number(m[1]);
        if (maybeFillYear(entry, yr)) {
          folderYear++;
          totalYearFills++;
        }
      }
      if (samples.length < 10) {
        samples.push({ folder, fname: _fname, before: oldDate, after: newDate });
      }
    }
  }

  if (folderDate > 0) {
    await writeFile(file, `${JSON.stringify(meta, null, 2)}\n`);
    console.log(`[clean-japanese-dates] ${folder}: ${folderDate} date_created rewrites, ${folderYear} year fills`);
  } else {
    console.log(`[clean-japanese-dates] ${folder}: nothing to rewrite`);
  }
}

console.log(`\n[clean-japanese-dates] total: ${totalDateRewrites} date_created rewrites, ${totalYearFills} year fills`);
for (const s of samples) {
  console.log(`  ${s.folder}/${s.fname}\n    ${JSON.stringify(s.before)} → ${JSON.stringify(s.after)}`);
}
