#!/bin/bash
# Downloads noVNC v1.5.0 ESM source into public/novnc/
# Run this once on the server: bash scripts/download-novnc.sh

set -e

VERSION="v1.5.0"
TARGET_DIR="public/novnc"
REPO_URL="https://github.com/novnc/noVNC/archive/refs/tags/${VERSION}.tar.gz"

echo "[noVNC] Downloading ${VERSION}..."
rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"

# Download and extract only the core/ directory
curl -sL "${REPO_URL}" | tar xz --strip-components=1 -C "${TARGET_DIR}" "noVNC-${VERSION#v}/core"

echo "[noVNC] Installed to ${TARGET_DIR}/core/"
echo "[noVNC] Files:"
find "${TARGET_DIR}/core" -name "*.js" | head -20
echo "[noVNC] Done!"
