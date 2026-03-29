'use client';

import { useVercelDeploymentStatus } from './VercelDeployStatusProvider';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatAbsolute(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

/** Compact date for sidebar (avoids long locale strings). */
function formatCompact(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const opts: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
    return d.toLocaleString(undefined, opts);
  } catch {
    return '';
  }
}

/** Tooltip: show commit message, fall back to full SHA. */
function shaTitle(git: { sha?: string; message?: string } | null | undefined): string | undefined {
  if (!git?.sha) return undefined;
  const msg = git.message?.trim();
  return msg || git.sha;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const SIDEBAR_BLOCK =
  'w-full min-w-0 pt-2 mt-1 border-t border-white/10 text-[11px] leading-tight text-left';

function MetaTime({ iso, title }: { iso: string | null; title: string | undefined }) {
  const line = formatCompact(iso);
  if (!line) return null;
  return (
    <p
      className="mt-0.5 text-[10px] leading-none text-slate-500/90 tabular-nums tracking-tight"
      title={title || line}
    >
      {line}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export type VercelDeployStatusProps = {
  /** Your app name shown in the status line (default: "App"). */
  appName?: string;
  /** "sidebar" for dark sidebar placement. "default" for light header/toolbar. */
  variant?: 'default' | 'sidebar';
  /** Narrow sidebar mode: show a pulse dot + tooltip only when building/error. */
  collapsed?: boolean;
  /** Path to the deployments page (default: "/deployments"). */
  deploymentsPath?: string;
};

/**
 * Shows your Vercel deployment status inline.
 *
 * States: Ready (green), Building/Queued (amber pulse), Error (red), Canceled (gray).
 *
 * Hover the commit SHA to see the full commit message.
 * Hover the time to see the absolute timestamp.
 */
export default function VercelDeployStatus({
  appName = 'App',
  variant = 'default',
  collapsed = false,
  deploymentsPath = '/deployments',
}: VercelDeployStatusProps) {
  const { status } = useVercelDeploymentStatus();

  if (!status) return null;

  const rs = (status.readyState || status.state || '').toUpperCase();
  const isBuilding = rs === 'BUILDING' || rs === 'QUEUED' || rs === 'INITIALIZING';
  const isError = rs === 'ERROR' || rs === 'FAILED';
  const isReady = rs === 'READY';
  const configBroken = !!(status.error && !status.readyState && !status.state);

  const timeLabel = status.readyAt || status.createdAt;
  const relative = formatRelative(timeLabel);
  const absolute = formatAbsolute(timeLabel);
  const shortSha = status.gitSource?.sha ? status.gitSource.sha.slice(0, 7) : null;
  const shaHoverTitle = shaTitle(status.gitSource);

  // Collapsed sidebar: only show a dot when something needs attention
  const needsAttention = variant === 'sidebar' && collapsed && (isBuilding || isError || configBroken);
  if (variant === 'sidebar' && collapsed && !needsAttention) return null;

  // --- Collapsed dot ---
  if (needsAttention) {
    const titleParts: string[] = [appName];
    if (configBroken) titleParts.push(`status unavailable (${status.error})`);
    else if (isError) titleParts.push(`deploy error${relative ? ` ${relative}` : ''}`);
    else titleParts.push(`building - started ${relative || '...'}`);
    const title = titleParts.join(': ');
    const dotClass = configBroken
      ? 'bg-amber-400'
      : isError
        ? 'bg-red-400'
        : 'bg-amber-400 animate-pulse';
    return (
      <div className="flex justify-center py-0.5">
        <a
          href={deploymentsPath}
          title={title}
          className="inline-flex items-center justify-center p-1 rounded-md hover:bg-white/10 transition-colors"
          aria-label={title}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} aria-hidden />
        </a>
      </div>
    );
  }

  // --- Config broken ---
  if (configBroken) {
    if (variant === 'sidebar') {
      return (
        <div className={`${SIDEBAR_BLOCK} text-slate-300/90`}>
          <p className="text-[11px] leading-snug">
            Vercel status unavailable ({status.error})
          </p>
          <a
            href={deploymentsPath}
            className="inline-block mt-1 text-blue-400 text-[11px] font-semibold underline hover:no-underline"
          >
            Deployments
          </a>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-slate-500 text-center">
        <span>Vercel status unavailable ({status.error})</span>
        <a href={deploymentsPath} className="text-blue-400 hover:underline font-semibold">
          Deployments
        </a>
      </div>
    );
  }

  const base = 'flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-center';

  // --- Error state ---
  if (isError) {
    if (variant === 'sidebar') {
      return (
        <div className={`${SIDEBAR_BLOCK} text-red-100`}>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span className="text-red-200">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 mr-1.5 align-middle" aria-hidden />
              {appName} deploy: <strong>Error</strong>
            </span>
            {relative && (
              <span className="text-red-100/90" title={absolute || undefined}>
                {relative}
              </span>
            )}
            {shortSha && (
              <>
                <span className="text-red-300/50 select-none" aria-hidden>-</span>
                <span className="font-mono text-[10px] text-red-200/85" title={shaHoverTitle}>
                  {shortSha}
                </span>
              </>
            )}
          </div>
          <MetaTime iso={timeLabel} title={absolute || undefined} />
          <a
            href={deploymentsPath}
            className="inline-block mt-1 text-blue-400 text-[11px] font-semibold underline hover:no-underline"
          >
            Open deployments
          </a>
        </div>
      );
    }
    return (
      <div className={`${base} text-red-400`}>
        <span>
          {appName} deploy: <strong>Error</strong>
          {relative && <span className="ml-1" title={absolute || undefined}>{relative}</span>}
        </span>
        <a href={deploymentsPath} className="text-blue-400 hover:underline font-semibold">
          Deployments
        </a>
      </div>
    );
  }

  // --- Building / Queued / Initializing ---
  if (isBuilding) {
    if (variant === 'sidebar') {
      return (
        <div className={`${SIDEBAR_BLOCK} text-amber-100`}>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300 animate-pulse mr-1.5 align-middle" aria-hidden />
              {appName}: <strong>Building</strong>
            </span>
            {relative && (
              <span className="text-amber-50/95" title={absolute || undefined}>
                started {relative}
              </span>
            )}
            {shortSha && (
              <>
                <span className="text-amber-200/40 select-none" aria-hidden>-</span>
                <span className="font-mono text-[10px] text-amber-200/80 cursor-default" title={shaHoverTitle}>{shortSha}</span>
              </>
            )}
          </div>
          <MetaTime iso={timeLabel} title={absolute || undefined} />
        </div>
      );
    }
    return (
      <div className={`${base} text-amber-300`}>
        <span>
          {appName}: <strong>Building</strong>
          {relative && <span className="ml-1" title={absolute || undefined}>started {relative}</span>}
        </span>
        {shortSha && (
          <span className="font-mono text-[10px] opacity-80 cursor-default" title={shaHoverTitle}>
            {shortSha}
          </span>
        )}
      </div>
    );
  }

  // --- Ready ---
  if (isReady) {
    if (variant === 'sidebar') {
      return (
        <div className={`${SIDEBAR_BLOCK} text-slate-400/95`}>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span>
              {appName}: <strong className="text-emerald-400/95">Ready</strong>
            </span>
            {relative && (
              <span className="text-slate-400/90" title={absolute || undefined}>
                {relative}
              </span>
            )}
            {shortSha && (
              <>
                <span className="text-slate-600/80 select-none" aria-hidden>-</span>
                <span className="font-mono text-[10px] text-slate-500" title={shaHoverTitle}>
                  {shortSha}
                </span>
              </>
            )}
          </div>
          <MetaTime iso={timeLabel} title={absolute || undefined} />
        </div>
      );
    }
    return (
      <div className={`${base} text-slate-400`}>
        <span>
          {appName}: <strong className="text-emerald-400">Ready</strong>
          {relative && <span className="ml-1" title={absolute || undefined}>{relative}</span>}
        </span>
        {shortSha && (
          <span className="font-mono text-[10px] opacity-70" title={shaHoverTitle}>
            {shortSha}
          </span>
        )}
      </div>
    );
  }

  // --- Canceled ---
  if (rs === 'CANCELED') {
    if (variant === 'sidebar') {
      return (
        <div className={`${SIDEBAR_BLOCK} text-slate-500`}>
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <span>{appName}: <strong>Canceled</strong></span>
            {relative && <span>{relative}</span>}
            {shortSha && (
              <>
                <span className="text-slate-600/70 select-none" aria-hidden>-</span>
                <span className="font-mono text-[10px] text-slate-500">{shortSha}</span>
              </>
            )}
          </div>
          <MetaTime iso={timeLabel} title={absolute || undefined} />
        </div>
      );
    }
    return (
      <div className={`${base} text-slate-500`}>
        {appName}: <strong>Canceled</strong>
        {relative && <span className="ml-1">{relative}</span>}
      </div>
    );
  }

  // --- Unknown state ---
  if (!rs) return null;

  if (variant === 'sidebar') {
    return (
      <div className={`${SIDEBAR_BLOCK} text-slate-400`}>
        <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
          <span>{appName} deploy: <strong>{rs}</strong></span>
          {relative && <span>{relative}</span>}
          {shortSha && (
            <>
              <span className="text-slate-600/80 select-none" aria-hidden>-</span>
              <span className="font-mono text-[10px] text-slate-500" title={shaHoverTitle}>
                {shortSha}
              </span>
            </>
          )}
        </div>
        <MetaTime iso={timeLabel} title={absolute || undefined} />
      </div>
    );
  }

  return (
    <div className={`${base} text-slate-500`}>
      <span>
        {appName} deploy: <strong>{rs}</strong>
        {relative && <span className="ml-1">{relative}</span>}
      </span>
    </div>
  );
}
