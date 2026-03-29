#!/bin/bash
# =============================================================================
# Vercel Deploy Watcher - CLI Installer
# https://github.com/kivimedia/vercel-deploy-watcher
#
# Installs a global git pre-push hook that automatically monitors Vercel
# deployment status after every git push, from any terminal or IDE.
#
# What this installs:
#   ~/.claude/hooks/vercel-deploy-check.sh  - the deploy monitor script
#   ~/.git-hooks/pre-push                   - the global git hook
#
# After install, every `git push` will spawn a background monitor that:
#   1. Waits 70s for Vercel to pick up the commit
#   2. Polls the Vercel API up to 6 times (10s apart)
#   3. Reports SUCCESS (with live URL), FAILED (with error), or TIMEOUT
#   4. Logs output to /tmp/vercel-deploy-*.log
#
# Requirements:
#   - Node.js (for JSON parsing)
#   - curl
#   - VERCEL_TOKEN set as an environment variable (or Windows User env var)
#   - VERCEL_ORG_ID (optional, for Vercel team accounts)
# =============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
RESET='\033[0m'

echo ""
echo -e "${BOLD}${CYAN}Vercel Deploy Watcher - Installer${RESET}"
echo -e "${CYAN}=====================================${RESET}"
echo ""

# 1. Create hooks directories
echo -e "${YELLOW}[1/5]${RESET} Creating hooks directories..."
mkdir -p ~/.claude/hooks ~/.git-hooks

# 2. Write the deploy monitor script
echo -e "${YELLOW}[2/5]${RESET} Installing deploy monitor script..."
cat > ~/.claude/hooks/vercel-deploy-check.sh << 'SCRIPT_EOF'
#!/bin/bash
# Vercel deployment monitor.
# Waits 70s after push, then polls deployment status up to 6 times (10s apart).
# Usage: vercel-deploy-check.sh [commit_sha]

# Load Vercel env vars from Windows if not in bash env
if [ -z "$VERCEL_TOKEN" ]; then
  VERCEL_TOKEN=$(powershell.exe -Command "[Environment]::GetEnvironmentVariable('VERCEL_TOKEN', 'User')" 2>/dev/null | tr -d '\r')
fi
if [ -z "$VERCEL_ORG_ID" ]; then
  VERCEL_ORG_ID=$(powershell.exe -Command "[Environment]::GetEnvironmentVariable('VERCEL_ORG_ID', 'User')" 2>/dev/null | tr -d '\r')
fi

SHA="${1:-$(git log -1 --format='%H' 2>/dev/null)}"
SHORT_SHA="${SHA:0:7}"

if [ -z "$SHA" ]; then
  echo "ERROR: Could not determine commit SHA"
  exit 1
fi

if [ -z "$VERCEL_TOKEN" ]; then
  echo "ERROR: VERCEL_TOKEN not set (check Windows User env vars)"
  exit 1
fi

TEAM_PARAM=""
if [ -n "$VERCEL_ORG_ID" ]; then
  TEAM_PARAM="&teamId=$VERCEL_ORG_ID"
fi

echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] Monitoring Vercel deploy for commit $SHORT_SHA..."
echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] Waiting 70s for build to start..."
sleep 70

for i in $(seq 1 6); do
  RESPONSE=$(curl -s -H "Authorization: Bearer $VERCEL_TOKEN" \
    "https://api.vercel.com/v6/deployments?limit=10&sort=created&direction=desc${TEAM_PARAM}" 2>/dev/null)

  RESULT=$(echo "$RESPONSE" | node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try {
        const j=JSON.parse(d);
        const deps=j.deployments||[];
        const match=deps.find(dep=>
          dep.meta?.githubCommitSha==='$SHA'||
          (dep.meta?.githubCommitSha||'').startsWith('$SHORT_SHA')
        );
        if(match){
          console.log(JSON.stringify({
            state:match.state||match.readyState||'UNKNOWN',
            url:match.url||'',
            name:match.name||'',
            uid:match.uid||'',
            error:match.errorMessage||''
          }));
        }else{
          console.log(JSON.stringify({state:'NOT_FOUND'}));
        }
      }catch(e){
        console.log(JSON.stringify({state:'API_ERROR',error:e.message}));
      }
    });
  ")

  STATE=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).state)}catch(e){console.log('PARSE_ERROR')}})")
  URL=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).url)}catch(e){console.log('')}})")
  NAME=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).name)}catch(e){console.log('')}})")
  ERR_MSG=$(echo "$RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).error)}catch(e){console.log('')}})")

  case "$STATE" in
    READY)
      echo ""
      echo "=== VERCEL DEPLOY SUCCESS ==="
      echo "Project: $NAME"
      echo "Live at: https://$URL"
      echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] Build completed successfully."
      exit 0
      ;;
    ERROR)
      echo ""
      echo "=== VERCEL DEPLOY FAILED ==="
      echo "Project: $NAME"
      echo "URL: https://$URL"
      if [ -n "$ERR_MSG" ]; then
        echo "Error: $ERR_MSG"
      fi
      echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] ACTION NEEDED: Check build logs and fix."
      exit 1
      ;;
    BUILDING|QUEUED|INITIALIZING)
      echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] Check $i/6: $NAME still $STATE..."
      if [ $i -lt 6 ]; then
        sleep 10
      fi
      ;;
    CANCELED)
      echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] DEPLOY CANCELED: $NAME"
      exit 1
      ;;
    NOT_FOUND)
      echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] Check $i/6: No deployment found for $SHORT_SHA yet..."
      if [ $i -lt 6 ]; then
        sleep 10
      fi
      ;;
    *)
      echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] Check $i/6: State=$STATE"
      if [ $i -lt 6 ]; then
        sleep 10
      fi
      ;;
  esac
done

echo ""
echo "=== VERCEL DEPLOY TIMEOUT ==="
echo "[$(TZ='Asia/Jerusalem' date '+%H:%M:%S IST')] Deployment for $SHORT_SHA didn't complete after 6 checks (~130s total)."
echo "Check manually at: https://vercel.com"
exit 2
SCRIPT_EOF

# 3. Write the global pre-push hook
echo -e "${YELLOW}[3/5]${RESET} Installing global pre-push hook..."
cat > ~/.git-hooks/pre-push << 'HOOK_EOF'
#!/bin/bash
# Global pre-push hook: spawns Vercel deploy monitor in background.
# Since the monitor waits 70s before polling, it naturally runs after push completes.
# Works in any IDE (Cursor, VS Code, terminal).

MONITOR_SCRIPT="$HOME/.claude/hooks/vercel-deploy-check.sh"
if [ ! -f "$MONITOR_SCRIPT" ]; then
  exit 0
fi

SHA=$(git log -1 --format='%H' 2>/dev/null)
if [ -z "$SHA" ]; then
  exit 0
fi

# Spawn monitor in background, log to /tmp
nohup bash "$MONITOR_SCRIPT" "$SHA" > /tmp/vercel-deploy-$(date +%s).log 2>&1 &

# Always let the push proceed
exit 0
HOOK_EOF

# 4. Make scripts executable
echo -e "${YELLOW}[4/5]${RESET} Setting permissions..."
chmod +x ~/.claude/hooks/vercel-deploy-check.sh
chmod +x ~/.git-hooks/pre-push

# 5. Configure git global hooks path
echo -e "${YELLOW}[5/5]${RESET} Configuring git global hooks path..."
git config --global core.hooksPath ~/.git-hooks

echo ""
echo -e "${GREEN}${BOLD}=== INSTALLATION COMPLETE ===${RESET}"
echo ""
echo -e "  Monitor script:  ${CYAN}~/.claude/hooks/vercel-deploy-check.sh${RESET}"
echo -e "  Pre-push hook:   ${CYAN}~/.git-hooks/pre-push${RESET}"
echo -e "  Git hooks path:  ${CYAN}~/.git-hooks${RESET} (global)"
echo -e "  Deploy logs:     ${CYAN}/tmp/vercel-deploy-*.log${RESET}"
echo ""
echo -e "${YELLOW}REQUIRED: Set these environment variables:${RESET}"
echo ""
echo -e "  ${BOLD}VERCEL_TOKEN${RESET}   - Your Vercel API token"
echo -e "               Get one at: https://vercel.com/account/tokens"
echo ""
echo -e "  ${BOLD}VERCEL_ORG_ID${RESET}  - Your Vercel team/org ID (optional, for team accounts)"
echo ""
echo -e "  ${BOLD}Windows:${RESET} Win+R > systempropertiesadvanced > Environment Variables > User variables"
echo -e "  ${BOLD}Mac/Linux:${RESET} Add export lines to your .bashrc or .zshrc"
echo ""
echo -e "Every ${BOLD}git push${RESET} from any terminal or IDE will now auto-monitor Vercel deployments."
echo -e "Check results with: ${CYAN}cat \$(ls -t /tmp/vercel-deploy-*.log 2>/dev/null | head -1)${RESET}"
echo ""
