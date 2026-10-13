#!/usr/bin/env bash
# One command, reproducible: PDF -> extract -> geocode (cached) -> validate/build -> src/data/dhaak.v1.json
set -euo pipefail; cd "$(dirname "$0")/.."
PDF=${1:-pipeline/guide.pdf}
[ -f "$PDF" ] && pdftotext -layout "$PDF" pipeline/source.txt
python3 pipeline/extract.py pipeline/source.txt data/01_extracted.json
python3 pipeline/geocode.py data/01_extracted.json data/02_geocoded.json
python3 pipeline/pin.py data/02_geocoded.json data/02b_pinned.json
python3 pipeline/build.py data/02b_pinned.json src/data/dhaak.v1.json "${FETCHED:-2026-10-13}"
