#!/usr/bin/env bash
# Dev-only image pipeline (not part of the app, not a dependency): needs ImageMagick with WebP.
#
#   scripts/build-images.sh <source-dir> [game-id ...]
#
# For every <source-dir>/<id>.png|jpg it writes public/images/games/<id>.webp (1280x800, <= 150 KB)
# and <id>-640.webp (640x400, <= 36 KB): centre-cropped to 16:10, metadata stripped, quality lowered
# until the budget holds. Only these optimised outputs are committed; sources are not.
set -euo pipefail

SRC="${1:?usage: build-images.sh <source-dir> [game-id ...]}"
shift || true
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/images/games"
mkdir -p "$OUT"

# encode <input> <width> <height> <max-bytes> <output>
encode() {
  local input="$1" w="$2" h="$3" max="$4" output="$5" q soften
  # Very detailed pictures (foliage, circuit boards) can miss the budget even at low quality; a touch of
  # softening is the last resort and is only used for those.
  for soften in 0 0.7 1.4; do
    for q in 82 78 74 70 66 62 58 54 50 46 42 38 34 30; do
      convert "$input" -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" -strip \
        $([ "$soften" != 0 ] && echo "-blur 0x$soften") \
        -define webp:method=6 -define webp:auto-filter=true -quality "$q" "$output"
      if [ "$(stat -c %s "$output")" -le "$max" ]; then return 0; fi
    done
  done
  echo "could not fit $output into $max bytes" >&2
  return 1
}

if [ "$#" -gt 0 ]; then ids=("$@"); else
  ids=(); for f in "$SRC"/*.png "$SRC"/*.jpg; do [ -e "$f" ] && b="$(basename "$f")" && ids+=("${b%.*}"); done
fi

for id in "${ids[@]}"; do
  file=""
  for candidate in "$SRC/$id.png" "$SRC/$id.jpg"; do [ -e "$candidate" ] && file="$candidate" && break; done
  [ -n "$file" ] || { echo "no source for $id" >&2; exit 1; }
  encode "$file" 1280 800 153600 "$OUT/$id.webp"
  encode "$file" 640 400 36864 "$OUT/$id-640.webp"
  printf '%-22s %7s B  %6s B\n' "$id" "$(stat -c %s "$OUT/$id.webp")" "$(stat -c %s "$OUT/$id-640.webp")"
done
