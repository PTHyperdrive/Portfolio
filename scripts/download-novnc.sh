#!/bin/bash
# Downloads noVNC v1.5.0 ESM source into public/novnc/
# Run this once on the server: bash scripts/download-novnc.sh

set -e

VERSION="v1.5.0"
TARGET_DIR="public/novnc"
REPO_URL="https://github.com/novnc/noVNC/archive/refs/tags/${VERSION}.tar.gz"
STRIP_PREFIX="noVNC-${VERSION#v}"

echo "[noVNC] Downloading ${VERSION}..."
rm -rf "${TARGET_DIR}"
mkdir -p "${TARGET_DIR}"

# Download and extract core/ and vendor/ directories
curl -sL "${REPO_URL}" | tar xz --strip-components=1 -C "${TARGET_DIR}" \
    "${STRIP_PREFIX}/core" \
    "${STRIP_PREFIX}/vendor"

echo "[noVNC] Installed to ${TARGET_DIR}/"
echo "[noVNC] Directories:"
ls -la "${TARGET_DIR}/"
echo "[noVNC] Done!"
