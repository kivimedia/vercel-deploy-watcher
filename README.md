# Vercel Deploy Watcher

**Monitor Vercel deployments from your terminal and your Next.js app.**

No more switching to the Vercel dashboard after every push. Get instant feedback in your terminal, and a live status widget in your app's UI.

---

## CLI Watcher

Automatically monitors Vercel deploy status after every `git push` - from any terminal, IDE, or AI coding agent.

### How it works

1. A global git `pre-push` hook fires on every push
2. It spawns a background monitor process (non-blocking - your push completes immediately)
3. The monitor waits 70 seconds for Vercel to pick up the commit
4. It polls the Vercel API up to 6 times, 10 seconds apart
5. It reports: `SUCCESS` (with live URL), `FAILED` (with error message), or `TIMEOUT`

Total monitoring window: ~130 seconds after push.

### Quick install

```bash
bash cli/install.sh
```

Or with curl (no cloning required):

```bash
bash <(curl -s https://raw.githubusercontent.com/kivimedia/vercel-deploy-watcher/main/cli/install.sh)
```

### Requirements

- Node.js (used for JSON parsing)
- curl (included in Git Bash on Windows)
- Git Bash on Windows, or any bash shell on Mac/Linux
- `VDW_VERCEL_TOKEN` set as an environment variable
- `VERCEL_ORG_ID` (optional, for team accounts)

### Getting your Vercel token

1. Go to https://vercel.com/account/tokens
2. Create a token with "Full Account" scope
3. Set it as an environment variable:
   - **Windows**: Win+R > `systempropertiesadvanced` > Environment Variables > User variables > New
   - **Mac/Linux**: Add `export VDW_VERCEL_TOKEN=...` to your `.bashrc` or `.zshrc`

### Manual usage

```bash
# Check the latest commit's deployment
bash ~/.claude/hooks/vercel-deploy-check.sh

# Check a specific commit
bash ~/.claude/hooks/vercel-deploy-check.sh abc1234def5678

# View the latest monitor log
cat $(ls -t /tmp/vercel-deploy-*.log 2>/dev/null | head -1)
```

See [cli/](cli/) for the full scripts and uninstall instructions.

---

## Next.js Widget

A live deploy status badge for your app's sidebar or header. Shows the current deployment state, how long ago it deployed, and the commit SHA with a tooltip showing the full commit message.

### Status states

```
App: Ready  14m ago - 00d19e5        <- green badge
App: Building  started 2m ago - abc1234   <- amber pulsing badge
App deploy: Error  5m ago - def5678   <- red badge
App deploy: Canceled  8m ago - ghi9012  <- gray badge
```

### What's included

- `components/VercelDeployStatus.tsx` - the status badge component
- `components/VercelDeployStatusProvider.tsx` - polling context provider (refreshes every 30s)
- `app/api/deployments/` - Next.js API route that proxies the Vercel API server-side
- `app/deployments/` - a full `/deployments` dashboard page with build logs

### Quick install

Copy the files from `widget/` into your Next.js project, or use the install script:

```bash
bash <(curl -s https://raw.githubusercontent.com/kivimedia/vercel-deploy-watcher/main/widget/install.sh)
```

Then add to your layout or sidebar:

```tsx
import { VercelDeployStatusProvider } from '@/components/VercelDeployStatusProvider'
import { VercelDeployStatus } from '@/components/VercelDeployStatus'

// Wrap your layout
<VercelDeployStatusProvider>
  <VercelDeployStatus appName="My App" />
</VercelDeployStatusProvider>
```

### Requirements

- Next.js 14+ with App Router
- Tailwind CSS
- `VDW_VERCEL_TOKEN` and `VDW_VERCEL_PROJECT_ID` set in your `.env.local`
- `VERCEL_ORG_ID` (optional, for team accounts)

See [widget/README.md](widget/README.md) for the full setup guide, env var reference, and the `/deployments` dashboard docs.

---

## License

MIT - see [LICENSE](LICENSE)
