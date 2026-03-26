# Vercel Deploy Watcher - Auto-Monitor Deployments After Every Push

A system that automatically monitors Vercel deployment status after every `git push`, regardless of IDE or terminal. Reports success, failure, or timeout.

## How It Works

1. **Git push happens** (from any IDE, terminal, or AI agent)
2. **Pre-push hook** spawns a background monitor process
3. **Monitor waits 70 seconds** for Vercel to pick up the commit
4. **Polls Vercel API** up to 6 times, 10 seconds apart
5. **Reports result**: SUCCESS (with live URL), FAILED (with error), or TIMEOUT

Total monitoring window: ~130 seconds after push.

---

## One-Copy-Paste Installation

Run this entire block in Git Bash (Windows) or any bash terminal:

```bash
# 1. Create hooks directory
mkdir -p ~/.claude/hooks ~/.git-hooks

# 2. Create the Vercel deploy monitoring script
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

# 3. Create the global git pre-push hook
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
chmod +x ~/.claude/hooks/vercel-deploy-check.sh
chmod +x ~/.git-hooks/pre-push

# 5. Set global git hooks path
git config --global core.hooksPath ~/.git-hooks

echo ""
echo "=== INSTALLATION COMPLETE ==="
echo "Global git hooks path: ~/.git-hooks"
echo "Monitor script: ~/.claude/hooks/vercel-deploy-check.sh"
echo ""
echo "REQUIRED: Set these as Windows User environment variables:"
echo "  VERCEL_TOKEN   - Your Vercel API token"
echo "  VERCEL_ORG_ID  - Your Vercel team/org ID (optional, for team accounts)"
echo ""
echo "Every 'git push' from any terminal or IDE will now auto-monitor Vercel deployments."
echo "Logs are written to /tmp/vercel-deploy-*.log"
```

---

## Prerequisites

- **Node.js** (used for JSON parsing since jq isn't available on Windows)
- **curl** (included in Git Bash)
- **Git Bash** on Windows (or any bash shell on Mac/Linux)
- **VERCEL_TOKEN** set as a Windows User environment variable (or exported in shell)
- **VERCEL_ORG_ID** set as a Windows User environment variable (optional, for team accounts)

### Getting your Vercel token

1. Go to https://vercel.com/account/tokens
2. Create a new token with "Full Account" scope
3. Set it as a Windows User env var:
   - Win+R > `systempropertiesadvanced` > Environment Variables > User variables > New
   - Name: `VERCEL_TOKEN`, Value: your token

---

## For AI Coding Agents (Cursor, Claude Code, etc.)

### Cursor Rules

Add this to your global or project-level Cursor rules:

```
After every git push, a background Vercel deploy monitor is running automatically.
The monitor script is at ~/.claude/hooks/vercel-deploy-check.sh and logs to /tmp/vercel-deploy-*.log.

After pushing code to any Vercel-deployed repo:
1. Wait ~2 minutes for the monitor to complete
2. Check the latest log: cat /tmp/$(ls -t /tmp/vercel-deploy-*.log 2>/dev/null | head -1)
3. If the deploy FAILED, immediately investigate the build error and fix it
4. If the deploy SUCCEEDED, report the live URL to the user
5. If no log exists, run the monitor manually: bash ~/.claude/hooks/vercel-deploy-check.sh

You can also run the monitor directly to check deployment status at any time:
  bash ~/.claude/hooks/vercel-deploy-check.sh [commit_sha]
```

### Claude Code

Already handled via PostToolUse hook in `~/.claude/settings.json`. No additional setup needed.

---

## Manual Usage

Check status of the latest commit's deployment:
```bash
bash ~/.claude/hooks/vercel-deploy-check.sh
```

Check a specific commit:
```bash
bash ~/.claude/hooks/vercel-deploy-check.sh abc1234def5678
```

View latest monitor log:
```bash
cat $(ls -t /tmp/vercel-deploy-*.log 2>/dev/null | head -1)
```

---

## Uninstall

```bash
# Remove global hooks path (reverts to per-repo .git/hooks/)
git config --global --unset core.hooksPath

# Remove scripts
rm -f ~/.git-hooks/pre-push
rm -f ~/.claude/hooks/vercel-deploy-check.sh
rm -f ~/.claude/hooks/post-push-vercel.sh

# Remove Claude Code hook from ~/.claude/settings.json (edit manually)
```
