#!/usr/bin/env bash
# Dev-only (not part of the app, not a dependency): needs ImageMagick with WebP.
#
#   scripts/build-arcade-art.sh <srcdir> [--icons-only]
#
# <srcdir> holds the generated pictures: hero.png, cover-arcade.png, cover-party.png, cover-strategy.png,
# cover-puzzle.png, backdrop.png and trophy.png. Writes, all within budget:
#   public/images/hero.webp (1600x900, <= 150 KB) + hero-800.webp (800x450, <= 60 KB)
#   public/images/categories/<slug>.webp (1280x800, <= 150 KB) + <slug>-640.webp (640x400, <= 40 KB)
#   public/images/og-image.jpg (1200x630: the hero with the wordmark)
#   public/images/backdrop.webp (960x540) and public/images/trophy.webp (480x480)
#   public/favicon-48.png and public/apple-touch-icon.png, drawn to match public/favicon.svg
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="${1:?usage: scripts/build-arcade-art.sh <srcdir>}"
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p public/images/categories

encode() { # encode <input> <w> <h> <max-bytes> <output>
  local input="$1" w="$2" h="$3" max="$4" output="$5" q
  for q in 84 80 76 72 68 64 60 56 52 48 44 40 36 32; do
    convert "$input" -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" -strip -define webp:method=6 -define webp:auto-filter=true -quality "$q" "$output"
    if [ "$(stat -c %s "$output")" -le "$max" ]; then return 0; fi
  done
  echo "could not fit $output into $max bytes" >&2; return 1
}

if [ "${2:-}" != "--icons-only" ]; then
  encode "$SRC/hero.png" 1600 900 153600 public/images/hero.webp
  encode "$SRC/hero.png" 800 450 61440 public/images/hero-800.webp
  for slug in arcade party strategy puzzle; do
    encode "$SRC/cover-$slug.png" 1280 800 153600 "public/images/categories/$slug.webp"
    encode "$SRC/cover-$slug.png" 640 400 40960 "public/images/categories/$slug-640.webp"
  done
  encode "$SRC/backdrop.png" 960 540 61440 public/images/backdrop.webp
  encode "$SRC/trophy.png" 480 480 51200 public/images/trophy.webp

  # Social image: the hero, a dark panel on the left and the wordmark.
  convert "$SRC/hero.png" -resize 1200x1200 -gravity center -crop 1200x630+0+0 +repage \
    \( -size 1200x630 xc:none -fill 'rgba(10,6,24,0.88)' -draw 'rectangle 0,0 520,630' -blur 0x50 \) -composite -gravity NorthWest \
    -font DejaVu-Sans-Bold -fill '#ffd23f' -pointsize 70 -annotate +56+170 'PSD-gaming' \
    -fill '#ffffff' -pointsize 34 -annotate +56+262 'Insert friends. Press start.' \
    -font DejaVu-Sans -fill '#9be7ff' -pointsize 24 -annotate +56+335 '40 browser arcade games · 2–3 players' \
    -annotate +56+375 'No downloads. Share a link and play.' \
    -strip -quality 84 public/images/og-image.jpg
fi

# Icons: the brand mark (a helmet) on the arcade yellow.
convert -size 512x512 xc:none -fill '#ffd23f' -draw 'roundrectangle 0,0 511,511 112,112' \
  -fill '#140a2e' -draw 'polygon 102,192 179,90 333,90 410,192 384,410 128,410' \
  -fill '#ff3da6' -draw 'polygon 115,205 397,205 371,307 141,307' \
  -stroke '#140a2e' -strokewidth 26 -draw 'stroke-linecap round line 218,358 294,358' "$T/icon.png"
convert "$T/icon.png" -resize 48x48 -strip public/favicon-48.png
convert "$T/icon.png" -resize 180x180 -strip public/apple-touch-icon.png
echo built
