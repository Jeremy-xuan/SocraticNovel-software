#!/usr/bin/env bash
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { printf "${BLUE}ℹ${RESET}  %s\n" "$*"; }
success() { printf "${GREEN}✔${RESET}  %s\n" "$*"; }
warn()    { printf "${YELLOW}⚠${RESET}  %s\n" "$*"; }
error()   { printf "${RED}✖${RESET}  %s\n" "$*" >&2; }
step()    { printf "\n${BOLD}${CYAN}▸ %s${RESET}\n" "$*"; }

die() { error "$*"; exit 1; }

cleanup() {
    if [[ -n "${MOUNT_POINT:-}" ]] && mount | grep -q "$MOUNT_POINT"; then
        hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
    fi
    [[ -n "${DMG_PATH:-}" && -f "${DMG_PATH:-}" ]] && rm -f "$DMG_PATH"
}
trap cleanup EXIT

# ── Constants ─────────────────────────────────────────────────────────────────
REPO="Jeremy-xuan/SocraticNovel-software"
API_URL="https://api.github.com/repos/${REPO}/releases"
APP_NAME="socratic-novel.app"
DMG_PATTERN="socratic-novel_*.dmg"
INSTALL_DIR="/Applications"

DMG_PATH=""
MOUNT_POINT=""
VERSION=""

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
${BOLD}Socratic Novel Installer${RESET}

Usage: $(basename "$0") [OPTIONS]

Options:
  --version <tag>   Install a specific version (e.g. --version v0.3.1)
  -h, --help        Show this help message

Examples:
  $(basename "$0")                  # install latest release
  $(basename "$0") --version v0.3.1 # install specific version
EOF
    exit 0
}

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --version)
            [[ -z "${2:-}" ]] && die "--version requires a tag argument (e.g. v0.3.1)"
            VERSION="$2"; shift 2 ;;
        -h|--help)
            usage ;;
        *)
            die "Unknown option: $1 (use --help for usage)" ;;
    esac
done

# ── Pre-flight checks ────────────────────────────────────────────────────────
step "Pre-flight checks"

[[ "$(uname -s)" == "Darwin" ]] || die "This installer only supports macOS."

ARCH="$(uname -m)"
info "System architecture: ${BOLD}${ARCH}${RESET}"

command -v curl  >/dev/null 2>&1 || die "curl is required but not found."
command -v hdiutil >/dev/null 2>&1 || die "hdiutil is required but not found."

# ── Resolve version & download URL ───────────────────────────────────────────
step "Resolving release"

if [[ -n "$VERSION" ]]; then
    info "Requested version: ${BOLD}${VERSION}${RESET}"
    RELEASE_URL="${API_URL}/tags/${VERSION}"
else
    info "Fetching latest release…"
    RELEASE_URL="${API_URL}/latest"
fi

HTTP_RESPONSE=$(curl -sS -w "\n%{http_code}" "$RELEASE_URL") \
    || die "Failed to contact GitHub API. Check your network connection."

HTTP_CODE=$(echo "$HTTP_RESPONSE" | tail -1)
RELEASE_JSON=$(echo "$HTTP_RESPONSE" | sed '$d')

[[ "$HTTP_CODE" == "200" ]] || die "GitHub API returned HTTP ${HTTP_CODE}. Is the version tag correct?"

TAG_NAME=$(echo "$RELEASE_JSON" | grep -o '"tag_name"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | cut -d'"' -f4)
[[ -n "$TAG_NAME" ]] || die "Could not parse tag name from release JSON."
success "Release: ${BOLD}${TAG_NAME}${RESET}"

# Find the DMG asset URL (Universal Binary — single DMG for all architectures)
DOWNLOAD_URL=$(echo "$RELEASE_JSON" \
    | grep -o '"browser_download_url"[[:space:]]*:[[:space:]]*"[^"]*\.dmg"' \
    | head -1 \
    | cut -d'"' -f4)

[[ -n "$DOWNLOAD_URL" ]] || die "No .dmg asset found in release ${TAG_NAME}."
DMG_FILENAME=$(basename "$DOWNLOAD_URL")
info "Asset: ${DMG_FILENAME}"

# ── Download ──────────────────────────────────────────────────────────────────
step "Downloading ${DMG_FILENAME}"

DMG_PATH="${HOME}/Downloads/${DMG_FILENAME}"
curl -L --progress-bar -o "$DMG_PATH" "$DOWNLOAD_URL" \
    || die "Download failed."
success "Downloaded to ${DMG_PATH}"

# ── Mount DMG ─────────────────────────────────────────────────────────────────
step "Mounting disk image"

MOUNT_OUTPUT=$(hdiutil attach "$DMG_PATH" -nobrowse -quiet 2>&1) \
    || die "Failed to mount DMG:\n${MOUNT_OUTPUT}"

MOUNT_POINT=$(echo "$MOUNT_OUTPUT" | grep -oE '/Volumes/[^\t]+' | tail -1 | sed 's/[[:space:]]*$//')
[[ -d "$MOUNT_POINT" ]] || die "Could not determine mount point."
success "Mounted at ${MOUNT_POINT}"

# ── Locate .app ───────────────────────────────────────────────────────────────
APP_SOURCE=$(find "$MOUNT_POINT" -maxdepth 2 -name "${APP_NAME}" -type d 2>/dev/null | head -1)
[[ -d "${APP_SOURCE:-}" ]] || die "Could not find ${APP_NAME} inside the disk image."
info "Found app: ${APP_SOURCE}"

# ── Install to /Applications ─────────────────────────────────────────────────
step "Installing to ${INSTALL_DIR}"

DEST="${INSTALL_DIR}/${APP_NAME}"

do_install() {
    rm -rf "$DEST"
    cp -R "$APP_SOURCE" "$DEST"
    xattr -cr "$DEST"
}

if [[ -w "$INSTALL_DIR" ]]; then
    do_install
else
    warn "/Applications is not writable — requesting sudo"
    sudo bash -c "$(declare -f do_install); DEST='${DEST}' APP_SOURCE='${APP_SOURCE}' do_install"
fi

success "Installed ${APP_NAME} → ${DEST}"

# ── Unmount ───────────────────────────────────────────────────────────────────
step "Cleaning up"

hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null || true
MOUNT_POINT=""
success "Disk image unmounted"

rm -f "$DMG_PATH"
DMG_PATH=""
success "Downloaded DMG removed"

# ── Done ──────────────────────────────────────────────────────────────────────
printf "\n${GREEN}${BOLD}🎉 Socratic Novel ${TAG_NAME} installed successfully!${RESET}\n"
info "You can launch it from ${BOLD}/Applications/${APP_NAME}${RESET} or Spotlight."
