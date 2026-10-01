#!/usr/bin/env bash
# Dev-only (not part of the app, not a dependency): needs ImageMagick with WebP.
#
#   scripts/build-composites.sh
#
# Builds, from the generated per-game photos in public/images/games/ and from drawing primitives:
#   public/images/hero.webp (1600x900, <= 150 KB) + hero-800.webp (800x450, <= 60 KB)
#   public/images/categories/<slug>.webp (1280x800, <= 150 KB) + <slug>-640.webp (640x400, <= 36 KB)
#   public/images/og-image.jpg (1200x630)
#   public/favicon-48.png and public/apple-touch-icon.png (180x180), drawn to match public/favicon.svg
# Each picture is a "table of game photos": the photos laid out as slightly rotated prints on a blurred,
# darkened copy of one of them. Nothing here comes from a third party.
set -euo pipefail
cd "$(dirname "$0")/.."
G=public/images/games
T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p public/images/categories

encode() { # encode <input> <w> <h> <max-bytes> <output>
  local input="$1" w="$2" h="$3" max="$4" output="$5" q
  for q in 84 80 76 72 68 64 60 56 52 48 44 40; do
    convert "$input" -resize "${w}x${h}!" -strip -define webp:method=6 -define webp:auto-filter=true -quality "$q" "$output"
    if [ "$(stat -c %s "$output")" -le "$max" ]; then return 0; fi
  done
  echo "could not fit $output into $max bytes" >&2; return 1
}

card() { # card <id> <width> <rotation> <out.png>: a photo print with a cream border and a soft shadow
  convert "$G/$1.webp" -resize "$2x" -bordercolor '#f4eee5' -border 9 \
    \( +clone -background black -shadow 55x12+5+9 \) +swap -background none -layers merge +repage \
    -background none -rotate "$3" +repage "$4"
}

table() { # table <w> <h> <bg-id> <out.png> then groups of "id width rotation cx cy"
  local w="$1" h="$2" bg="$3" out="$4"; shift 4
  convert "$G/$bg.webp" -resize "${w}x${h}^" -gravity center -extent "${w}x${h}" -blur 0x22 -modulate 48,80 "$out"
  local n=0 spec
  for spec in "$@"; do
    set -- $spec; n=$((n + 1))
    card "$1" "$2" "$3" "$T/c$n.png"
    convert "$out" "$T/c$n.png" -gravity center -geometry "$(printf '%+d%+d' $(( $4 - w / 2 )) $(( $5 - h / 2 )))" -composite "$out"
  done
}

# ---- hero: cards on the right, the left stays calm for the headline (the CSS scrim sits over it) ----
table 1600 900 pixel-tac-toe "$T/hero.png" \
  "memory-match 440 -3 860 640" "connect-four 520 -5 1010 270" "neon-gomoku 520 6 1330 330" \
  "dice-duel 470 7 1190 660" "codebreaker 400 -8 1470 720"
encode "$T/hero.png" 1600 900 153600 public/images/hero.webp
encode "$T/hero.png" 800 450 61440 public/images/hero-800.webp

# ---- category covers ----
cover() { # cover <slug> <bg-id> <id1> <id2> <id3> <id4>
  table 1280 800 "$2" "$T/$1.png" "$3 520 -4 360 250" "$4 520 5 910 235" "$5 520 3 390 590" "$6 520 -5 900 575"
  encode "$T/$1.png" 1280 800 153600 "public/images/categories/$1.webp"
  encode "$T/$1.png" 640 400 36864 "public/images/categories/$1-640.webp"
}
cover arcade pixel-tap pixel-tap pong-rally maze-runner laser-duel
cover party dice-duel dice-duel button-masher air-hockey retro-trivia
cover strategy connect-four connect-four neon-gomoku sea-battle pixel-fleet
cover puzzle memory-match memory-match codebreaker brain-busters mastermind

# ---- social image (1200x630): cards on the right, wordmark on the left ----
table 1200 630 pixel-tac-toe "$T/og-bg.png" \
  "connect-four 360 -5 840 180" "neon-gomoku 360 6 1060 230" "dice-duel 340 5 930 460" "codebreaker 300 -7 1100 495"
convert "$T/og-bg.png" \
  \( -size 1200x630 xc:none -fill 'rgba(20,17,15,0.86)' -draw 'rectangle 0,0 520,630' -blur 0x50 \) -composite -gravity NorthWest \
  -font DejaVu-Sans-Bold -fill '#e8a33d' -pointsize 70 -annotate +56+170 'PSD-gaming' \
  -fill '#f4eee5' -pointsize 34 -annotate +56+262 'Your arcade. Everywhere.' \
  -font DejaVu-Sans -fill '#c2b7a8' -pointsize 24 -annotate +56+335 '40 browser games · 2–3 players' \
  -annotate +56+375 'No downloads. Share a link and play.' \
  -strip -quality 84 public/images/og-image.jpg

# ---- icons: the app's brand mark (a helmet) on amber ----
convert -size 512x512 xc:none -fill '#e8a33d' -draw 'roundrectangle 0,0 511,511 112,112' \
  -fill '#1a1208' -draw 'polygon 102,192 179,90 333,90 410,192 384,410 128,410' \
  -fill '#e8a33d' -draw 'polygon 115,205 397,205 371,307 141,307' \
  -stroke '#1a1208' -strokewidth 26 -draw 'stroke-linecap round line 218,358 294,358' "$T/icon.png"
convert "$T/icon.png" -resize 48x48 -strip public/favicon-48.png
convert "$T/icon.png" -resize 180x180 -strip public/apple-touch-icon.png
echo built
