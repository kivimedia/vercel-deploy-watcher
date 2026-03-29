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
