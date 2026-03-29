# Vercel Deploy Status Widget for Next.js

Live deployment status in your sidebar - shows Ready, Building, Error with commit SHA hover tooltips.

---

## Prerequisites

- Next.js 14+ with App Router
- Tailwind CSS
- Vercel API token (see Step 5)

---

## Quick Install

Run this from the root of your Next.js project:

```bash
bash <(curl -s https://raw.githubusercontent.com/kivimedia/vercel-deploy-watcher/main/widget/install.sh)
```

The script detects your project structure, prompts for an app name, and copies all files into place.

---

## Manual Install

### Step 1: Copy the components

Copy these two files into your project:

```
widget/components/VercelDeployStatus.tsx          -> src/components/VercelDeployStatus.tsx
widget/components/VercelDeployStatusProvider.tsx  -> src/components/VercelDeployStatusProvider.tsx
```

If your project does not use a `src/` directory, copy them to `components/` instead.

### Step 2: Copy the API routes

```
widget/api/deployments/route.ts          -> src/app/api/deployments/route.ts
widget/api/deployments/status/route.ts   -> src/app/api/deployments/status/route.ts
```

Create the directories first if they do not exist:

```bash
mkdir -p src/app/api/deployments/status
```

### Step 3: Wrap your layout

In your root `src/app/layout.tsx`, import the provider and wrap your app:

```tsx
import { VercelDeployStatusProvider } from '@/components/VercelDeployStatusProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <VercelDeployStatusProvider>
          {children}
        </VercelDeployStatusProvider>
      </body>
    </html>
  );
}
```

### Step 4: Add the widget

Place `<VercelDeployStatus />` anywhere inside the provider tree.

**Basic usage (light header/toolbar):**

```tsx
import VercelDeployStatus from '@/components/VercelDeployStatus';

// Inside a header or toolbar:
<VercelDeployStatus appName="My App" />
```

**Sidebar usage (dark background):**

```tsx
<VercelDeployStatus
  appName="My App"
  variant="sidebar"
  deploymentsPath="/deployments"
/>
```

**Collapsed mode (dot-only when building or error):**

```tsx
<VercelDeployStatus
  appName="My App"
  variant="sidebar"
  collapsed={true}
/>
```

In collapsed mode the widget renders nothing when the deployment is `READY`. It shows a pulsing amber or red dot only when something needs attention.

### Step 5: Set environment variables

Add these to your `.env.local` (and to your Vercel project environment variables):

```
VERCEL_TOKEN=your_vercel_api_token
VERCEL_TEAM_ID=your_vercel_team_id
VERCEL_PROJECT_ID=the_project_to_monitor
```

- **VERCEL_TOKEN** - create one at https://vercel.com/account/tokens (scope: read deployments)
- **VERCEL_TEAM_ID** - found in your Vercel team settings URL or via `vercel teams ls`
- **VERCEL_PROJECT_ID** - found in your Vercel project settings, under "Project ID"

### Step 6 (Optional): Add the deployments page

Copy the full deployments dashboard into your app:

```
widget/app/deployments/page.tsx -> src/app/deployments/page.tsx
```

This gives you a full-page view at `/deployments` with:
- All recent deployments across your team
- Build log expansion (click any row)
- Project and state filters
- 15-second auto-refresh
- Auto-expands the first ERROR deployment with its build logs

---

## Props Reference

### VercelDeployStatus

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `appName` | `string` | `"App"` | Name shown in the status line |
| `variant` | `"default"` \| `"sidebar"` | `"default"` | `"default"` for light header/toolbar, `"sidebar"` for dark sidebar |
| `collapsed` | `boolean` | `false` | Narrow mode: show a pulsing dot only when building or error |
| `deploymentsPath` | `string` | `"/deployments"` | Link target when clicking "Open deployments" on error state |

### VercelDeployStatusProvider

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `disabled` | `boolean` | `false` | Disables polling entirely (useful on public-facing pages) |
| `pollMs` | `number` | `30000` | Polling interval in milliseconds |

---

## Customization

**Change colors:** Edit the Tailwind classes directly in `VercelDeployStatus.tsx`. Each state (READY, BUILDING, ERROR, CANCELED) has its own section with clearly labeled class strings.

**Change polling interval:**

```tsx
<VercelDeployStatusProvider pollMs={60000}>
  {children}
</VercelDeployStatusProvider>
```

**Disable on public pages:**

```tsx
<VercelDeployStatusProvider disabled={!isSignedIn}>
  {children}
</VercelDeployStatusProvider>
```

**Add authentication to the API routes:** The status route at `src/app/api/deployments/status/route.ts` has a clearly marked comment block at the top of the `GET` function where you can add session checks, API key validation, or any other auth logic before the Vercel API call is made.

---

## What each state looks like

| State | Color | Behavior |
|-------|-------|----------|
| READY | Green | Static dot, relative time, commit SHA |
| BUILDING | Amber | Pulsing dot, "started X ago", commit SHA |
| QUEUED | Amber | Same as BUILDING |
| INITIALIZING | Amber | Same as BUILDING |
| ERROR | Red | Static red dot, link to deployments page |
| CANCELED | Gray | Muted, no action link |

Hovering the commit SHA shows the full commit message as a tooltip. Hovering the relative time (e.g. "2h ago") shows the absolute date and time.
