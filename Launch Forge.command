#!/bin/bash
set -e
cd "$(dirname "$0")"

# Node bootstrap — the only prereq setup.mjs cannot check from inside Node.
if ! command -v node >/dev/null 2>&1; then
  echo "Node is required but not installed."
  if command -v brew >/dev/null 2>&1; then
    read -rp "Install Node 20 via Homebrew? [y/N] " reply
    if [[ "$reply" =~ ^[Yy] ]]; then
      brew install node@20 && brew link --overwrite node@20
    else
      echo "Install Node from https://nodejs.org, then re-run."
      exit 1
    fi
  else
    echo "Install Homebrew (https://brew.sh) then Node, or download Node from https://nodejs.org"
    exit 1
  fi
fi

# First-run detection: missing deps OR missing .env means setup hasn't run.
if [ ! -d "node_modules" ] || [ ! -f "friday/.env" ]; then
  node scripts/setup.mjs || exit 1
fi

npm run dev
