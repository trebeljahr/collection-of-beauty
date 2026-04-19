#!/bin/bash

# Kunstformen der Natur Image Downloader using curl
# This script downloads all images with proper rate limiting and retry logic

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$ROOT_DIR/assets/kunstformen-images"
DELAY=3  # Seconds between downloads
MAX_RETRIES=5
RETRY_DELAY=10  # Seconds to wait before retry

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Color codes for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to calculate MD5 hash (for direct URL construction)
get_md5() {
    echo -n "$1" | md5sum | cut -d' ' -f1
}

# Function to get direct Wikimedia URL
get_direct_url() {
    local filename="$1"
    local md5=$(get_md5 "$filename")
    local a="${md5:0:1}"
    local ab="${md5:0:2}"
    echo "https://upload.wikimedia.org/wikipedia/commons/$a/$ab/$filename"
}

# Function to download a file with retry logic
download_file() {
    local filename="$1"
    local url="$2"
    local output_path="$OUTPUT_DIR/$filename"
    local retry=0
    
    while [ $retry -le $MAX_RETRIES ]; do
        # Use curl with:
        # -L: follow redirects
        # -s: silent mode
        # -S: show errors even in silent mode
        # --limit-rate: limit download speed to avoid triggering rate limits
        # --retry: built-in retry logic
        # --retry-delay: wait between retries
        # -f: fail silently on HTTP errors
        # -o: output file
        
        curl -L -S --limit-rate 1M \
             --retry 3 --retry-delay 5 \
             -H "User-Agent: Mozilla/5.0 (compatible; EducationalProject/1.0)" \
             -f -o "$output_path" "$url" 2>/dev/null
        
        local status=$?
        
        if [ $status -eq 0 ]; then
            return 0
        elif [ $status -eq 22 ]; then
            # HTTP error (like 429)
            if [ $retry -lt $MAX_RETRIES ]; then
                retry=$((retry + 1))
                local wait_time=$((RETRY_DELAY * retry))
                echo -e "    ${YELLOW}Rate limited. Waiting ${wait_time}s before retry $retry/$MAX_RETRIES...${NC}"
                sleep $wait_time
            else
                return 1
            fi
        else
            # Other error
            return 1
        fi
    done
    
    return 1
}

# Array of all image filenames
images=(
    "Haeckel_Phaeodaria_1.jpg"
    "Haeckel_Thalamphora.jpg"
    "Haeckel_Ciliata.jpg"
    "Haeckel_Diatomea_4.jpg"
    "Haeckel_Calcispongiae.jpg"
    "Haeckel_Tubulariae.jpg"
    "Haeckel_Siphonophorae_7.jpg"
    "Haeckel_Discomedusae_8.jpg"
    "Haeckel_Hexacoralla.jpg"
    "Haeckel_Ophiodea.jpg"
    "Haeckel_Discoidea.jpg"
    "Haeckel_Thalamophora_12.jpg"
    "Haeckel_Flagellata.jpg"
    "Haeckel_Peridinea.jpg"
    "Haeckel_Fucoideae.jpg"
    "Haeckel_Narcomedusae.jpg"
    "Haeckel_Siphonophorae.jpg"
    "Haeckel_Discomedusae_18.jpg"
    "Haeckel_Pennatulida.jpg"
    "Haeckel_Crinoidea.jpg"
    "Haeckel_Acanthometra.jpg"
    "Haeckel_Spyroidea.jpg"
    "Haeckel_Bryozoa.jpg"
    "Haeckel_Desmidiea.jpg"
    "Haeckel_Sertulariae.jpg"
    "Haeckel_Trachomedusae.jpg"
    "Haeckel_Ctenophorae.jpg"
    "Haeckel_Discomedusae_28.jpg"
    "Haeckel_Tetracoralla.jpg"
    "Haeckel_Echinidea.jpg"
    "Haeckel_Cyrtoidea.jpg"
    "Haeckel_Rotatoria.jpg"
    "Haeckel_Bryozoa_33.jpg"
    "Haeckel_Melethallia.jpg"
    "Haeckel_Hexactinellae.jpg"
    "Haeckel_Leptomedusae.jpg"
    "Haeckel_Siphonophorae_37.jpg"
    "Haeckel_Peromedusae.jpg"
    "Haeckel_Gorgonida.jpg"
    "Haeckel_Asteridea.jpg"
    "Haeckel_Acanthophracta.jpg"
    "Haeckel_Ostraciontes.jpg"
    "Haeckel_Nudibranchia.jpg"
    "Haeckel_Ammonitida.jpg"
    "Haeckel_Campanariae.jpg"
    "Haeckel_Anthomedusae.jpg"
    "Haeckel_Aspidonia.jpg"
    "Haeckel_Stauromedusae.jpg"
    "Haeckel_Actiniae.jpg"
    "Haeckel_Thuroidea.jpg"
    "Haeckel_Polycyttaria.jpg"
    "Haeckel_Filicinae.jpg"
    "Haeckel_Prosobranchia.jpg"
    "Haeckel_Gamochonia.jpg"
    "Haeckel_Acephala.jpg"
    "Haeckel_Copepoda.jpg"
    "Haeckel_Cirripedia.jpg"
    "Haeckel_Tineida.jpg"
    "Haeckel_Siphonophorae_59.jpg"
    "Haeckel_Echinidea_60.jpg"
    "Haeckel_Phaeodaria_61.jpg"
    "Haeckel_Nepenthaceae.jpg"
    "Haeckel_Basimycetes.jpg"
    "Haeckel_Siphoneae.jpg"
    "Haeckel_Florideae.jpg"
    "Haeckel_Arachnida.jpg"
    "Haeckel_Chiroptera.jpg"
    "Haeckel_Batrachia.jpg"
    "Haeckel_Hexacoralla_69.jpg"
    "Haeckel_Ophiodea_70.jpg"
    "Haeckel_Stephoidea.jpg"
    "Haeckel_Muscinae.jpg"
    "Haeckel_Ascomycetes.jpg"
    "Haeckel_Orchidae.jpg"
    "Haeckel_Platodes.jpg"
    "Haeckel_Thoracostraca.jpg"
    "Haeckel_Siphonophorae_77.jpg"
    "Haeckel_Cubomedusae.jpg"
    "Haeckel_Lacertilia.jpg"
    "Haeckel_Blastoidea.jpg"
    "Haeckel_Thalamophora_81.jpg"
    "Assortment_of_Hepaticae_from_Kunstformen_der_Natur_(1904),_plate_82.jpg"
    "Haeckel_Lichenes.jpg"
    "Haeckel_Diatomea.jpg"
    "Haeckel_Ascidiae.jpg"
    "Haeckel_Decapoda.jpg"
    "Haeckel_Teleostei.jpg"
    "Haeckel_Discomedusae_88.jpg"
    "Haeckel_Chelonia.jpg"
    "Haeckel_Cystoidea.jpg"
    "Haeckel_Spumellaria.jpg"
    "Haeckel_Filicinae_92.jpg"
    "Haeckel_Mycetozoa.jpg"
    "Haeckel_Coniferae.jpg"
    "Haeckel_Amphoridea.jpg"
    "Haeckel_Chaetopoda.jpg"
    "Haeckel_Spirobranchia.jpg"
    "Haeckel_Discomedusae_98.jpg"
    "Haeckel_Trochilidae.jpg"
    "Haeckel_Antilopina.jpg"
)

# Stats
total=${#images[@]}
success=0
failed=0
skipped=0
failed_files=()

echo "========================================="
echo "Kunstformen der Natur Image Downloader"
echo "========================================="
echo "Output directory: $OUTPUT_DIR"
echo "Total images: $total"
echo "Delay between downloads: ${DELAY}s"
echo ""

# Main download loop
for i in "${!images[@]}"; do
    filename="${images[$i]}"
    output_path="$OUTPUT_DIR/$filename"
    index=$((i + 1))
    
    # Skip if already exists
    if [ -f "$output_path" ]; then
        echo -e "[$index/$total] ${YELLOW}Skipping${NC} $filename (already exists)"
        skipped=$((skipped + 1))
        continue
    fi
    
    # Get direct URL
    url=$(get_direct_url "$filename")
    
    echo -e "[$index/$total] Downloading $filename..."
    
    if download_file "$filename" "$url"; then
        success=$((success + 1))
        echo -e "[$index/$total] ${GREEN}✓${NC} $filename"
    else
        failed=$((failed + 1))
        failed_files+=("$filename")
        echo -e "[$index/$total] ${RED}✗ Failed${NC} $filename"
    fi
    
    # Delay between downloads (but not after the last one)
    if [ $index -lt $total ]; then
        sleep $DELAY
    fi
done

# Summary
echo ""
echo "========================================="
echo "Download Complete"
echo "========================================="
echo -e "${GREEN}Successful:${NC} $success"
echo -e "${RED}Failed:${NC} $failed"
echo -e "${YELLOW}Skipped:${NC} $skipped"
echo "Total: $total"

if [ ${#failed_files[@]} -gt 0 ]; then
    echo ""
    echo "Failed files:"
    for file in "${failed_files[@]}"; do
        echo "  - $file"
    done
fi