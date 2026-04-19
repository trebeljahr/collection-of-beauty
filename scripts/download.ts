import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as crypto from "crypto";

const ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(ROOT, "assets", "kunstformen_images");
const DELAY_MS = 2000; // 2 second delay between downloads
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds between retries

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Generate MD5 hash of filename (used by Wikimedia for directory structure)
 */
function getMD5(str: string): string {
  return crypto.createHash("md5").update(str).digest("hex");
}

/**
 * Get the direct Wikimedia Commons URL using MD5 path structure
 */
function getDirectUrl(filename: string): string {
  const cleanFilename = filename.replace(/ /g, "_");
  const md5 = getMD5(cleanFilename);
  const a = md5[0];
  const ab = md5.slice(0, 2);

  // Wikimedia stores files at: https://upload.wikimedia.org/wikipedia/commons/a/ab/Filename.jpg
  return `https://upload.wikimedia.org/wikipedia/commons/${a}/${ab}/${encodeURIComponent(cleanFilename)}`;
}

/**
 * Downloads a file from a URL to a local path with retry logic
 */
function downloadFile(
  url: string,
  outputPath: string,
  retryCount = 0,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(outputPath);

    const options = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        Connection: "keep-alive",
        "Cache-Control": "max-age=0",
      },
    };

    https
      .get(url, options, (response) => {
        if (response.statusCode === 200) {
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            resolve();
          });
          file.on("error", (err) => {
            file.close();
            if (fs.existsSync(outputPath)) {
              fs.unlinkSync(outputPath);
            }
            reject(err);
          });
        } else if (response.statusCode === 429) {
          // Rate limited
          file.close();
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }

          if (retryCount < MAX_RETRIES) {
            const waitTime = RETRY_DELAY * (retryCount + 1);
            console.log(
              `    Rate limited. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}/${MAX_RETRIES}...`,
            );
            setTimeout(() => {
              downloadFile(url, outputPath, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, waitTime);
          } else {
            reject(new Error(`Rate limited after ${MAX_RETRIES} retries`));
          }
        } else if (response.statusCode === 302 || response.statusCode === 301) {
          file.close();
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
          if (response.headers.location) {
            downloadFile(response.headers.location, outputPath, retryCount)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error(`Redirect without location for ${url}`));
          }
        } else {
          file.close();
          if (fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
          }
          reject(new Error(`HTTP ${response.statusCode}`));
        }
      })
      .on("error", (err) => {
        file.close();
        if (fs.existsSync(outputPath)) {
          fs.unlinkSync(outputPath);
        }
        reject(err);
      });
  });
}

/**
 * Gets the list of image filenames
 */
async function getImageList(): Promise<string[]> {
  const images: string[] = [
    "Haeckel_Phaeodaria_1.jpg",
    "Haeckel_Thalamphora.jpg",
    "Haeckel_Ciliata.jpg",
    "Haeckel_Diatomea_4.jpg",
    "Haeckel_Calcispongiae.jpg",
    "Haeckel_Tubulariae.jpg",
    "Haeckel_Siphonophorae_7.jpg",
    "Haeckel_Discomedusae_8.jpg",
    "Haeckel_Hexacoralla.jpg",
    "Haeckel_Ophiodea.jpg",
    "Haeckel_Discoidea.jpg",
    "Haeckel_Thalamophora_12.jpg",
    "Haeckel_Flagellata.jpg",
    "Haeckel_Peridinea.jpg",
    "Haeckel_Fucoideae.jpg",
    "Haeckel_Narcomedusae.jpg",
    "Haeckel_Siphonophorae.jpg",
    "Haeckel_Discomedusae_18.jpg",
    "Haeckel_Pennatulida.jpg",
    "Haeckel_Crinoidea.jpg",
    "Haeckel_Acanthometra.jpg",
    "Haeckel_Spyroidea.jpg",
    "Haeckel_Bryozoa.jpg",
    "Haeckel_Desmidiea.jpg",
    "Haeckel_Sertulariae.jpg",
    "Haeckel_Trachomedusae.jpg",
    "Haeckel_Ctenophorae.jpg",
    "Haeckel_Discomedusae_28.jpg",
    "Haeckel_Tetracoralla.jpg",
    "Haeckel_Echinidea.jpg",
    "Haeckel_Cyrtoidea.jpg",
    "Haeckel_Rotatoria.jpg",
    "Haeckel_Bryozoa_33.jpg",
    "Haeckel_Melethallia.jpg",
    "Haeckel_Hexactinellae.jpg",
    "Haeckel_Leptomedusae.jpg",
    "Haeckel_Siphonophorae_37.jpg",
    "Haeckel_Peromedusae.jpg",
    "Haeckel_Gorgonida.jpg",
    "Haeckel_Asteridea.jpg",
    "Haeckel_Acanthophracta.jpg",
    "Haeckel_Ostraciontes.jpg",
    "Haeckel_Nudibranchia.jpg",
    "Haeckel_Ammonitida.jpg",
    "Haeckel_Campanariae.jpg",
    "Haeckel_Anthomedusae.jpg",
    "Haeckel_Aspidonia.jpg",
    "Haeckel_Stauromedusae.jpg",
    "Haeckel_Actiniae.jpg",
    "Haeckel_Thuroidea.jpg",
    "Haeckel_Polycyttaria.jpg",
    "Haeckel_Filicinae.jpg",
    "Haeckel_Prosobranchia.jpg",
    "Haeckel_Gamochonia.jpg",
    "Haeckel_Acephala.jpg",
    "Haeckel_Copepoda.jpg",
    "Haeckel_Cirripedia.jpg",
    "Haeckel_Tineida.jpg",
    "Haeckel_Siphonophorae_59.jpg",
    "Haeckel_Echinidea_60.jpg",
    "Haeckel_Phaeodaria_61.jpg",
    "Haeckel_Nepenthaceae.jpg",
    "Haeckel_Basimycetes.jpg",
    "Haeckel_Siphoneae.jpg",
    "Haeckel_Florideae.jpg",
    "Haeckel_Arachnida.jpg",
    "Haeckel_Chiroptera.jpg",
    "Haeckel_Batrachia.jpg",
    "Haeckel_Hexacoralla_69.jpg",
    "Haeckel_Ophiodea_70.jpg",
    "Haeckel_Stephoidea.jpg",
    "Haeckel_Muscinae.jpg",
    "Haeckel_Ascomycetes.jpg",
    "Haeckel_Orchidae.jpg",
    "Haeckel_Platodes.jpg",
    "Haeckel_Thoracostraca.jpg",
    "Haeckel_Siphonophorae_77.jpg",
    "Haeckel_Cubomedusae.jpg",
    "Haeckel_Lacertilia.jpg",
    "Haeckel_Blastoidea.jpg",
    "Haeckel_Thalamophora_81.jpg",
    "Assortment_of_Hepaticae_from_Kunstformen_der_Natur_(1904),_plate_82.jpg",
    "Haeckel_Lichenes.jpg",
    "Haeckel_Diatomea.jpg",
    "Haeckel_Ascidiae.jpg",
    "Haeckel_Decapoda.jpg",
    "Haeckel_Teleostei.jpg",
    "Haeckel_Discomedusae_88.jpg",
    "Haeckel_Chelonia.jpg",
    "Haeckel_Cystoidea.jpg",
    "Haeckel_Spumellaria.jpg",
    "Haeckel_Filicinae_92.jpg",
    "Haeckel_Mycetozoa.jpg",
    "Haeckel_Coniferae.jpg",
    "Haeckel_Amphoridea.jpg",
    "Haeckel_Chaetopoda.jpg",
    "Haeckel_Spirobranchia.jpg",
    "Haeckel_Discomedusae_98.jpg",
    "Haeckel_Trochilidae.jpg",
    "Haeckel_Antilopina.jpg",
  ];

  return images;
}

/**
 * Main function to download all images
 */
async function downloadAllImages() {
  console.log("Starting download of Kunstformen der Natur images...");
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Delay between downloads: ${DELAY_MS}ms`);
  console.log(`Max retries per file: ${MAX_RETRIES}\n`);

  const imageList = await getImageList();
  console.log(`Found ${imageList.length} images to download\n`);

  let successCount = 0;
  let failCount = 0;
  const failedFiles: string[] = [];

  for (let i = 0; i < imageList.length; i++) {
    const filename = imageList[i];
    const outputPath = path.join(OUTPUT_DIR, filename);

    // Skip if already downloaded
    if (fs.existsSync(outputPath)) {
      console.log(
        `[${i + 1}/${imageList.length}] Skipping ${filename} (already exists)`,
      );
      successCount++;
      continue;
    }

    try {
      const directUrl = getDirectUrl(filename);
      console.log(`[${i + 1}/${imageList.length}] Downloading ${filename}...`);
      await downloadFile(directUrl, outputPath);
      successCount++;
      console.log(`[${i + 1}/${imageList.length}] ✓ ${filename}`);

      // Delay between downloads
      if (i < imageList.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
      }
    } catch (error) {
      failCount++;
      failedFiles.push(filename);
      console.error(
        `[${i + 1}/${imageList.length}] ✗ Failed: ${filename} - ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  console.log("\n=== Download Complete ===");
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total: ${imageList.length}`);

  if (failedFiles.length > 0) {
    console.log("\nFailed files:");
    failedFiles.forEach((f) => console.log(`  - ${f}`));
  }
}

// Run the script
downloadAllImages().catch(console.error);
