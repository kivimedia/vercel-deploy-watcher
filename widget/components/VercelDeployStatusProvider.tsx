'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

/** How often to poll the status endpoint (ms). */
const POLL_MS = 30_000;

/** Shape returned by GET /api/deployments/status. */
export type VercelDeploymentStatusPayload = {
  ok: boolean;
  /** Vercel state: READY, BUILDING, ERROR, QUEUED, INITIALIZING, CANCELED */
  readyState: string | null;
  state: string | null;
  /** ISO timestamp when the deployment was created */
  createdAt: string | null;
  /** ISO timestamp when the deployment finished (READY or ERROR) */
  readyAt: string | null;
  /** Deployed URL (e.g. "https://my-app.vercel.app") */
  url: string | null;
  /** Git metadata from the deployment */
  gitSource?: { ref?: string; sha?: string; message?: string } | null;
  /** Error message if env vars are missing or Vercel API fails */
  error?: string;
};

const VercelDeploymentStatusContext = createContext<{
  status: VercelDeploymentStatusPayload | null;
} | null>(null);

export type VercelDeployStatusProviderProps = {
  children: ReactNode;
  /** Set to true to disable polling (e.g. on public pages). */
  disabled?: boolean;
  /** Override the default polling interval in milliseconds. */
  pollMs?: number;
};

/**
 * Wraps your app and polls /api/deployments/status every 30s.
 * All <VercelDeployStatus /> components read from this context.
 */
export function VercelDeployStatusProvider({
  children,
  disabled = false,
  pollMs = POLL_MS,
}: VercelDeployStatusProviderProps) {
  const [status, setStatus] = useState<VercelDeploymentStatusPayload | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/deployments/status', { credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json();
      if (json.data) setStatus(json.data as VercelDeploymentStatusPayload);
    } catch {
      /* network error - silently ignore */
    }
  }, []);

  useEffect(() => {
    if (disabled) return;
    loadStatus();
    const t = setInterval(loadStatus, pollMs);
    return () => clearInterval(t);
  }, [disabled, pollMs, loadStatus]);

  return (
    <VercelDeploymentStatusContext.Provider value={{ status }}>
      {children}
    </VercelDeploymentStatusContext.Provider>
  );
}

/**
 * Access the current Vercel deployment status from any component.
 * Must be used within a <VercelDeployStatusProvider>.
 */
export function useVercelDeploymentStatus() {
  const ctx = useContext(VercelDeploymentStatusContext);
  if (!ctx) {
    throw new Error('useVercelDeploymentStatus must be used within <VercelDeployStatusProvider>');
  }
  return ctx;
}
