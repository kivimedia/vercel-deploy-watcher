# Widget Architecture and Integration Guide

This document explains how the Vercel Deploy Status widget works internally. It is intended for developers who want to understand the code, customize it beyond the props API, or extend it with new features.

For setup instructions, see [README.md](./README.md).

---

## Architecture Overview

The widget uses a React Context pattern with three layers:

```
VercelDeployStatusProvider   (polling, state management)
  -> Context                 (broadcasts status to all consumers)
    -> VercelDeployStatus    (renders the UI for one placement)
```

This means you can place multiple `<VercelDeployStatus />` instances anywhere in your tree (sidebar, header, mobile nav) and they all share a single polling connection. There is no duplicated network traffic.

The provider lives in `VercelDeployStatusProvider.tsx`. The display component lives in `VercelDeployStatus.tsx`. They communicate only through the context - the display component has no knowledge of polling or API calls.

---

## Data Flow

1. `VercelDeployStatusProvider` mounts and immediately calls `loadStatus()`.
2. `loadStatus()` fetches `GET /api/deployments/status` with `credentials: 'include'` (passes cookies, needed for auth-protected routes).
3. The response is expected as `{ data: DeploymentStatusPayload }`.
4. If the response is OK and has a `data` field, state is updated via `setStatus()`.
5. A `setInterval` repeats this every `pollMs` milliseconds (default: 30,000).
6. Network errors are caught silently - a failed poll does not clear the last known status.
7. All `<VercelDeployStatus />` components re-render when status changes.

---

## API Route: /api/deployments/status

**File:** `src/app/api/deployments/status/route.ts`

This is the only route the widget polls. It calls the Vercel v6 deployments API with `limit=1` and `projectId` to get the single most recent deployment for your project.

The route transforms the raw Vercel API response into a clean, stable shape:

```ts
type DeploymentStatusPayload = {
  ok: boolean;
  readyState: string | null;   // primary state field
  state: string | null;        // fallback state field
  createdAt: string | null;    // ISO timestamp - when deployment was created
  readyAt: string | null;      // ISO timestamp - when it finished (READY or ERROR)
  url: string | null;          // full https URL of the deployed app
  gitSource?: {
    ref?: string;              // branch name
    sha?: string;              // full commit SHA
    message?: string;          // commit message
  } | null;
  error?: string;              // present when env vars are missing or API fails
};
```

The route normalizes a few things from the raw Vercel response:

- `createdAt` from Vercel can be a Unix timestamp (number) or an ISO string. The route converts it to ISO string in both cases.
- `readyAt` is always a Unix timestamp from Vercel (`ready` field). The route converts it to ISO string.
- The commit message is extracted from whichever meta field is present: `githubCommitMessage`, `gitCommitMessage`, or `commitMessage`.
- The deployment URL has `https://` prepended (Vercel returns it without the protocol).

The route uses `export const dynamic = 'force-dynamic'` and `cache: 'no-store'` on the fetch call to ensure it always returns fresh data and is never cached by Next.js.

---

## API Route: /api/deployments

**File:** `src/app/api/deployments/route.ts`

This route is used by the deployments page only - not by the sidebar widget. It supports three modes via query parameters:

| Query | Behavior |
|-------|----------|
| `?deploymentId=xxx` | Returns build log events for a specific deployment (Vercel v3 events API) |
| `?projects=1` | Returns all projects in the team (for the filter dropdown) |
| `?projectId=xxx&state=ERROR` | Returns the last 50 deployments, optionally filtered |

Build log events are raw Vercel event objects. The deployments page filters for `stdout`, `stderr`, and `command` types and joins their text into a scrollable pre block.

---

## State Machine

The widget recognizes these `readyState` / `state` values from Vercel:

| State | Display | Color | Dot animation |
|-------|---------|-------|---------------|
| `READY` | "App: Ready" | Emerald green | None |
| `BUILDING` | "App: Building" | Amber | Pulsing |
| `QUEUED` | "App: Building" | Amber | Pulsing |
| `INITIALIZING` | "App: Building" | Amber | Pulsing |
| `ERROR` | "App deploy: Error" | Red | None |
| `FAILED` | Same as ERROR | Red | None |
| `CANCELED` | "App: Canceled" | Gray | None |

The component reads both `status.readyState` and `status.state` and uppercases both before comparison. This handles edge cases where Vercel returns one field but not the other depending on the deployment age.

```ts
const rs = (status.readyState || status.state || '').toUpperCase();
const isBuilding = rs === 'BUILDING' || rs === 'QUEUED' || rs === 'INITIALIZING';
const isError = rs === 'ERROR' || rs === 'FAILED';
```

There is also a `configBroken` state that fires when `status.error` is set and neither state field has a value. This happens when environment variables are missing or the Vercel API returns an error. It renders a different message that makes misconfiguration obvious.

---

## Rendering: Default vs Sidebar Variant

The `variant` prop selects between two visual treatments. The core status logic is identical - only the markup and Tailwind classes differ.

**`variant="default"` (light background):** Renders as a centered flex row of small gray text, suitable for a header bar or toolbar. Uses `text-slate-400` base, emerald/amber/red for states.

**`variant="sidebar"` (dark background):** Renders as a block with `border-t border-white/10` separator and `pt-2 mt-1` spacing. Designed to sit at the bottom of a dark sidebar nav. Uses lighter text variants (`text-slate-400/95`, `text-amber-100`, `text-red-100`) that remain readable on dark backgrounds. Includes a secondary `MetaTime` line with a compact absolute date.

In both variants, the commit SHA renders as `font-mono text-[10px]` and carries a `title` attribute with the full commit message. Hovering it shows the tooltip natively via the browser.

The relative time (e.g. "2h ago") also carries a `title` attribute with the absolute date string, formatted with `toLocaleString` using `dateStyle: 'medium'` and `timeStyle: 'short'`.

---

## Collapsed Mode

When `collapsed={true}` and `variant="sidebar"`, the component enters a minimal dot-only mode:

- If the state is READY (or any non-attention state), the component returns `null` and renders nothing.
- If the state is BUILDING, QUEUED, or INITIALIZING, it renders a small pulsing amber dot wrapped in an anchor tag.
- If the state is ERROR or config is broken, it renders a static red or amber dot.
- The anchor links to `deploymentsPath` and the full status message is on the `title` attribute, visible on hover.

This is designed for a collapsed sidebar where there is no horizontal space for text, but you still want a signal when something is wrong.

---

## Polling Details

The provider uses `useCallback` for `loadStatus` with an empty dependency array, so the function reference is stable. The `useEffect` that sets up the interval depends on `[disabled, pollMs, loadStatus]`.

If `disabled` is `true`, neither the initial fetch nor the interval runs. This is useful when the widget is mounted in a layout that wraps both authenticated and public pages - you can pass `disabled={!isSignedIn}` to avoid unauthenticated requests.

Failed fetches (network error, non-OK response) are caught and silently ignored. The last successfully received status remains in state. This means a brief network glitch does not cause the widget to blank out.

---

## Deployments Page

**File:** `src/app/deployments/page.tsx`

This is a standalone `'use client'` page. It does not use the provider or context - it fetches directly from `/api/deployments`.

Key behaviors:

- On mount, fetches `/api/deployments?projects=1` to populate the project filter dropdown.
- Then fetches the deployment list and sets up a 15-second auto-refresh interval.
- On each fetch, if an ERROR deployment exists and no log panel is currently expanded, it auto-expands the first ERROR deployment and fetches its build logs immediately.
- Clicking any row toggles the build log panel. The log is fetched once and cached in component state for the session (`buildLogs` record keyed by deployment UID).
- Build logs are filtered to `stdout`, `stderr`, and `command` event types, capped at the last 200 lines.
- The Copy button uses `navigator.clipboard.writeText` and shows a brief "Copied!" confirmation.

The `STATE_STYLES` constant maps each state to a set of Tailwind classes (`bg`, `text`, `dot`, and optional `animate`). To change the visual for a state, edit that constant.

---

## Adding Authentication to the API Routes

Both routes have a comment block at the top of the `GET` function indicating where to add auth. The status route comment reads:

```ts
// ------------------------------------------------------------------
// Auth: Add your own authentication here if you want to protect this
// endpoint. For example, check a session cookie or API key.
// ------------------------------------------------------------------
```

A typical implementation with `next-auth`:

```ts
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of the route
}
```

A simple API key check:

```ts
export async function GET(request: Request) {
  const key = request.headers.get('x-api-key');
  if (key !== process.env.WIDGET_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of the route
}
```

The provider passes `credentials: 'include'` on every fetch, so session cookies are sent automatically. No changes are needed in the provider or component when you add cookie-based auth to the route.

---

## File Reference

```
widget/
  components/
    VercelDeployStatus.tsx           - Display component (all rendering logic)
    VercelDeployStatusProvider.tsx   - Context provider + polling
  api/
    deployments/
      route.ts                       - Multi-mode deployments API (list, logs, projects)
      status/
        route.ts                     - Single-endpoint status API (used by widget)
  app/
    deployments/
      page.tsx                       - Full-page deployments dashboard
  README.md                          - Setup guide
  INTEGRATION.md                     - This document
  install.sh                         - Automated installer script
```
