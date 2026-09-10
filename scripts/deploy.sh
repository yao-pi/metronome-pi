#!/usr/bin/env bash
#
# Publish docs/ to the yao-pi.github.io deploy mirror, which serves the app at
# its Production URL, https://yao-pi.github.io/.
#
# validation-key.txt is intentionally absent from FILES: it is Pi's proof of
# domain ownership, lives only in the mirror, and must never be overwritten.

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs"
DST="${DEPLOY_REPO:-$HOME/Claude/yao-pi.github.io}"
FILES=(index.html styles.css app.js config.js .nojekyll)

[ -d "$DST/.git" ] || { echo "error: $DST is not a git repo (set DEPLOY_REPO)" >&2; exit 1; }

for f in "${FILES[@]}"; do
  [ -f "$SRC/$f" ] || { echo "error: missing $SRC/$f" >&2; exit 1; }
  cp "$SRC/$f" "$DST/$f"
done

cd "$DST"

if git diff --quiet && git diff --cached --quiet; then
  echo "No changes to deploy."
  exit 0
fi

git add -- "${FILES[@]}"
git commit -q -m "${1:-Sync frontend from metronome-pi}"
git push -q origin main

echo "Deployed to https://yao-pi.github.io/"
git --no-pager log --oneline -1
