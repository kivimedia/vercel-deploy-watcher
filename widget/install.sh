#!/usr/bin/env bash
# install.sh - Vercel Deploy Status Widget installer
# Usage: bash install.sh [--name "My App"]
# Compatible with Mac, Linux, and Windows Git Bash

set -euo pipefail

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
info()    { echo -e "${CYAN}[info]${RESET}  $*"; }
success() { echo -e "${GREEN}[done]${RESET}  $*"; }
warn()    { echo -e "${YELLOW}[warn]${RESET}  $*"; }
error()   { echo -e "${RED}[error]${RESET} $*" >&2; }
die()     { error "$*"; exit 1; }

# ---------------------------------------------------------------------------
# Parse arguments
# ---------------------------------------------------------------------------
APP_NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      APP_NAME="$2"
      shift 2
      ;;
    --name=*)
      APP_NAME="${1#*=}"
      shift
      ;;
    -h|--help)
      echo "Usage: bash install.sh [--name \"My App\"]"
      echo ""
      echo "Options:"
      echo "  --name  App name to show in the widget (default: prompts you)"
      exit 0
      ;;
    *)
      die "Unknown argument: $1. Use --help for usage."
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Vercel Deploy Status Widget - Installer${RESET}"
echo "---------------------------------------"
echo ""

# ---------------------------------------------------------------------------
# Check: curl
# ---------------------------------------------------------------------------
if ! command -v curl &>/dev/null; then
  die "curl is required but not found. Install curl and try again."
fi

# ---------------------------------------------------------------------------
# Check: Next.js project
# ---------------------------------------------------------------------------
if ! ls next.config.* &>/dev/null 2>&1; then
  die "No next.config.* found. Run this script from the root of your Next.js project."
fi
info "Next.js project detected."

# ---------------------------------------------------------------------------
# Detect src/ layout
# ---------------------------------------------------------------------------
if [[ -d "src/app" ]]; then
  COMPONENTS_DIR="src/components"
  API_DIR="src/app/api"
  APP_DIR="src/app"
  info "Detected src/ directory layout."
elif [[ -d "app" ]]; then
  COMPONENTS_DIR="components"
  API_DIR="app/api"
  APP_DIR="app"
  info "Detected root app/ layout (no src/)."
else
  die "Could not find app/ or src/app/ directory. Is this a Next.js App Router project?"
fi

# ---------------------------------------------------------------------------
# App name
# ---------------------------------------------------------------------------
if [[ -z "$APP_NAME" ]]; then
  echo -n -e "${CYAN}[input]${RESET}  App name for the widget (default: App): "
  read -r APP_NAME_INPUT
  APP_NAME="${APP_NAME_INPUT:-App}"
fi

# Trim leading/trailing whitespace
APP_NAME="$(echo "$APP_NAME" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
if [[ -z "$APP_NAME" ]]; then
  APP_NAME="App"
fi

info "Using app name: ${BOLD}${APP_NAME}${RESET}"

# ---------------------------------------------------------------------------
# GitHub raw base URL
# ---------------------------------------------------------------------------
BASE_URL="https://raw.githubusercontent.com/kivimedia/vercel-deploy-watcher/main/widget"

# ---------------------------------------------------------------------------
# Download helper
# ---------------------------------------------------------------------------
download_file() {
  local url="$1"
  local dest="$2"
  local dir
  dir="$(dirname "$dest")"

  mkdir -p "$dir"

  if ! curl -fsSL "$url" -o "$dest"; then
    die "Failed to download: $url\nCheck your internet connection or try again."
  fi
  success "Downloaded -> $dest"
}

# ---------------------------------------------------------------------------
# Step 1: Components
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Step 1/4 - Copying components${RESET}"

download_file \
  "${BASE_URL}/components/VercelDeployStatus.tsx" \
  "${COMPONENTS_DIR}/VercelDeployStatus.tsx"

download_file \
  "${BASE_URL}/components/VercelDeployStatusProvider.tsx" \
  "${COMPONENTS_DIR}/VercelDeployStatusProvider.tsx"

# ---------------------------------------------------------------------------
# Step 2: API routes
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Step 2/4 - Copying API routes${RESET}"

download_file \
  "${BASE_URL}/api/deployments/route.ts" \
  "${API_DIR}/deployments/route.ts"

download_file \
  "${BASE_URL}/api/deployments/status/route.ts" \
  "${API_DIR}/deployments/status/route.ts"

# ---------------------------------------------------------------------------
# Step 3: Replace default app name
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Step 3/4 - Setting app name${RESET}"

STATUS_FILE="${COMPONENTS_DIR}/VercelDeployStatus.tsx"

# Escape special characters in APP_NAME for sed
ESCAPED_NAME="$(printf '%s\n' "$APP_NAME" | sed 's/[[\.*^$()+?{|]/\\&/g')"

if grep -q "appName = 'App'" "$STATUS_FILE"; then
  sed -i "s/appName = 'App'/appName = '${ESCAPED_NAME}'/" "$STATUS_FILE"
  success "Default app name set to: ${APP_NAME}"
else
  warn "Could not find default appName in VercelDeployStatus.tsx - set it manually via the prop."
fi

# ---------------------------------------------------------------------------
# Step 4: Deployments page (optional)
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}Step 4/4 - Deployments page (optional)${RESET}"

DEPLOY_PAGE_DEST="${APP_DIR}/deployments/page.tsx"
if [[ -f "$DEPLOY_PAGE_DEST" ]]; then
  warn "Deployments page already exists at ${DEPLOY_PAGE_DEST} - skipping."
else
  echo -n -e "${CYAN}[input]${RESET}  Install the full deployments page at /${APP_DIR}/deployments/page.tsx? [Y/n]: "
  read -r INSTALL_PAGE
  INSTALL_PAGE="${INSTALL_PAGE:-Y}"
  if [[ "$INSTALL_PAGE" =~ ^[Yy]$ ]]; then
    download_file \
      "${BASE_URL}/app/deployments/page.tsx" \
      "$DEPLOY_PAGE_DEST"
  else
    info "Skipped deployments page."
  fi
fi

# ---------------------------------------------------------------------------
# Done - post-install instructions
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}${BOLD}Installation complete!${RESET}"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo ""
echo -e "  ${BOLD}1. Add environment variables${RESET} to .env.local:"
echo ""
echo "     VERCEL_TOKEN=your_vercel_api_token"
echo "     VERCEL_TEAM_ID=your_vercel_team_id"
echo "     VERCEL_PROJECT_ID=the_project_to_monitor"
echo ""
echo "     Get your token at: https://vercel.com/account/tokens"
echo ""
echo -e "  ${BOLD}2. Wrap your root layout${RESET} in ${APP_DIR}/layout.tsx:"
echo ""
echo "     import { VercelDeployStatusProvider } from '@/components/VercelDeployStatusProvider';"
echo ""
echo "     export default function RootLayout({ children }) {"
echo "       return ("
echo "         <html lang=\"en\">"
echo "           <body>"
echo "             <VercelDeployStatusProvider>"
echo "               {children}"
echo "             </VercelDeployStatusProvider>"
echo "           </body>"
echo "         </html>"
echo "       );"
echo "     }"
echo ""
echo -e "  ${BOLD}3. Add the widget${RESET} to your sidebar or header:"
echo ""
echo "     import VercelDeployStatus from '@/components/VercelDeployStatus';"
echo ""
echo "     // Light header / toolbar:"
echo "     <VercelDeployStatus appName=\"${APP_NAME}\" />"
echo ""
echo "     // Dark sidebar:"
echo "     <VercelDeployStatus appName=\"${APP_NAME}\" variant=\"sidebar\" />"
echo ""
echo -e "  ${BOLD}4. Done.${RESET} The widget polls /api/deployments/status every 30s."
echo ""
echo "  For full documentation: widget/README.md"
echo "  For architecture details: widget/INTEGRATION.md"
echo ""
