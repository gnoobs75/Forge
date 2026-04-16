#!/bin/bash
# Setup Forge Studio module for Friday
# Creates symlink from this directory to Friday's forge location

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODULE_SRC="$SCRIPT_DIR/forge-studio"
FORGE_DIR="$HOME/.friday/forge"
MODULE_DST="$FORGE_DIR/forge-studio"

echo "[friday:setup] Setting up Forge Studio module..."

# Create forge directory if it doesn't exist
mkdir -p "$FORGE_DIR"

# Remove existing symlink or directory
if [ -L "$MODULE_DST" ]; then
  echo "[friday:setup] Removing existing symlink..."
  rm "$MODULE_DST"
elif [ -d "$MODULE_DST" ]; then
  echo "[friday:setup] WARNING: $MODULE_DST exists as a directory. Backing up..."
  mv "$MODULE_DST" "${MODULE_DST}.backup.$(date +%s)"
fi

# Create symlink
ln -s "$MODULE_SRC" "$MODULE_DST"
echo "[friday:setup] Symlinked: $MODULE_DST -> $MODULE_SRC"

# Copy GENESIS if not present
GENESIS_DST="$HOME/.friday/GENESIS.md"
GENESIS_SRC="$SCRIPT_DIR/GENESIS-studio-director.md"
if [ ! -f "$GENESIS_DST" ]; then
  cp "$GENESIS_SRC" "$GENESIS_DST"
  echo "[friday:setup] Copied GENESIS to $GENESIS_DST"
else
  echo "[friday:setup] GENESIS already exists at $GENESIS_DST (not overwriting)"
fi

echo "[friday:setup] Done! Set FORGE_HQ_DATA env var if hq-data is not at C:/Claude/Samurai/hq-data"
