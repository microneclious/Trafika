#!/bin/sh
# Adds Trafika to your app menu, pointing at the release build in this folder.
# Build first: npm run tauri build -- --no-bundle
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$HOME/.local/share/applications"
sed "s#@DIR@#$DIR#g" "$DIR/scripts/trafika.desktop" > "$HOME/.local/share/applications/trafika.desktop"
echo "Installed $HOME/.local/share/applications/trafika.desktop"
