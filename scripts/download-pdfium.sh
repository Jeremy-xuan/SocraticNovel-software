#!/bin/bash
# Download PDFium shared library for the current platform.
# The library is placed in src-tauri/libs/ for development
# and will be bundled with the app for distribution.
#
# Source: https://github.com/bblanchon/pdfium-binaries
# Used by pdfium-render crate for PDF page rendering.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LIBS_DIR="$PROJECT_DIR/src-tauri/libs"

mkdir -p "$LIBS_DIR"

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Darwin)
        case "$ARCH" in
            arm64) PLATFORM="mac-arm64" ;;
            x86_64) PLATFORM="mac-x64" ;;
            *) echo "Unsupported macOS architecture: $ARCH"; exit 1 ;;
        esac
        LIB_NAME="libpdfium.dylib"
        ;;
    Linux)
        case "$ARCH" in
            x86_64) PLATFORM="linux-x64" ;;
            aarch64) PLATFORM="linux-arm64" ;;
            *) echo "Unsupported Linux architecture: $ARCH"; exit 1 ;;
        esac
        LIB_NAME="libpdfium.so"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        case "$ARCH" in
            x86_64|AMD64) PLATFORM="win-x64" ;;
            aarch64|ARM64) PLATFORM="win-arm64" ;;
            *) PLATFORM="win-x64" ;;
        esac
        LIB_NAME="pdfium.dll"
        ;;
    *)
        echo "Unsupported OS: $OS"
        exit 1
        ;;
esac

TARGET="$LIBS_DIR/$LIB_NAME"

if [ -f "$TARGET" ]; then
    echo "✅ PDFium already exists at $TARGET"
    echo "   Delete it first if you want to re-download."
    exit 0
fi

echo "📥 Downloading PDFium for $PLATFORM..."

# Pre-built PDFium binaries from bblanchon/pdfium-binaries (Chromium project)
PDFIUM_TAG="chromium/7749"
BASE_URL="https://github.com/bblanchon/pdfium-binaries/releases/download/${PDFIUM_TAG}"
ARCHIVE="pdfium-${PLATFORM}.tgz"
URL="${BASE_URL}/${ARCHIVE}"

echo "   URL: $URL"

TEMP_DIR="$(mktemp -d)"
trap "rm -rf $TEMP_DIR" EXIT

curl -L --fail -o "$TEMP_DIR/$ARCHIVE" "$URL" || {
    echo ""
    echo "❌ Download failed. You can manually download PDFium from:"
    echo "   https://github.com/bblanchon/pdfium-binaries/releases"
    echo ""
    echo "   Download: $ARCHIVE"
    echo "   Extract $LIB_NAME and place it in: $LIBS_DIR/"
    exit 1
}

echo "📦 Extracting..."
tar -xzf "$TEMP_DIR/$ARCHIVE" -C "$TEMP_DIR"

# The library is at lib/libpdfium.dylib (or .so / .dll) inside the archive
FOUND="$(find "$TEMP_DIR" -name "$LIB_NAME" -type f | head -1)"
if [ -z "$FOUND" ]; then
    echo "❌ Could not find $LIB_NAME in archive"
    echo "   Archive contents:"
    tar -tzf "$TEMP_DIR/$ARCHIVE" | head -20
    exit 1
fi

cp "$FOUND" "$TARGET"
echo "✅ PDFium installed to $TARGET"
echo "   Size: $(du -h "$TARGET" | cut -f1)"
echo ""
echo "The library will be bundled with the app via tauri.conf.json resources."
