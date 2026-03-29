'use client';

import { useState, useEffect, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Deployment {
  uid: string;
  name: string;
  url: string;
  state: 'BUILDING' | 'READY' | 'ERROR' | 'QUEUED' | 'CANCELED' | 'INITIALIZING';
  created: number;
  buildingAt?: number;
  ready?: number;
  creator?: { username?: string };
  meta?: {
    githubCommitSha?: string;
    githubCommitMessage?: string;
    githubCommitRef?: string;
  };
  target?: string;
}

interface Project {
  id: string;
  name: string;
}

interface BuildEvent {
  type: string;
  created: number;
  payload?: { text?: string; statusCode?: number; deploymentId?: string };
  text?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_STYLES: Record<string, { bg: string; text: string; dot: string; animate?: boolean }> = {
  READY: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', dot: 'bg-emerald-500' },
  BUILDING: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500', animate: true },
  INITIALIZING: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', dot: 'bg-amber-500', animate: true },
  ERROR: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500' },
  QUEUED: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', dot: 'bg-blue-500' },
  CANCELED: { bg: 'bg-gray-100 dark:bg-gray-800/50', text: 'text-gray-500 dark:text-gray-400', dot: 'bg-gray-400' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function buildDuration(d: Deployment): string {
  if (!d.buildingAt || !d.ready) return '-';
  const secs = Math.floor((d.ready - d.buildingAt) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Full-page deployments dashboard.
 *
 * Drop this file into your Next.js app at `app/deployments/page.tsx`.
 * It uses the /api/deployments route to list deployments and show build logs.
 *
 * Auto-refreshes every 15 seconds.
 */
export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [buildLogs, setBuildLogs] = useState<Record<string, string>>({});
  const [logLoading, setLogLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchBuildLog = useCallback(async (deploymentId: string) => {
    if (buildLogs[deploymentId]) return;
    setLogLoading(deploymentId);
    try {
      const res = await fetch(`/api/deployments?deploymentId=${deploymentId}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const events: BuildEvent[] = data.events || [];
      const lines = events
        .filter((e: BuildEvent) => e.type === 'stdout' || e.type === 'stderr' || e.type === 'command')
        .map((e: BuildEvent) => e.payload?.text || e.text || '')
        .filter(Boolean);
      const output = lines.slice(-200).join('\n');
      setBuildLogs(prev => ({ ...prev, [deploymentId]: output || 'No build logs available' }));
    } catch {
      setBuildLogs(prev => ({ ...prev, [deploymentId]: 'Failed to load build logs' }));
    } finally {
      setLogLoading(null);
    }
  }, [buildLogs]);

  const fetchDeployments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (projectFilter) params.set('projectId', projectFilter);
      if (stateFilter) params.set('state', stateFilter);
      const res = await fetch(`/api/deployments?${params}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status}: ${body}`);
      }
      const data = await res.json();
      const deps: Deployment[] = data.deployments || [];
      setDeployments(deps);
      setLastUpdated(new Date());
      setError(null);

      // Auto-expand first ERROR deployment and fetch its logs
      const firstError = deps.find(d => d.state === 'ERROR');
      if (firstError && !expandedLog) {
        setExpandedLog(firstError.uid);
        fetchBuildLog(firstError.uid);
      }
    } catch (e) {
      setError(`Failed to load deployments: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [projectFilter, stateFilter, expandedLog, fetchBuildLog]);

  useEffect(() => {
    fetch('/api/deployments?projects=1')
      .then(r => r.json())
      .then(d => setProjects(d.projects || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchDeployments();
    const interval = setInterval(fetchDeployments, 15000);
    return () => clearInterval(interval);
  }, [fetchDeployments]);

  function toggleBuildLog(deploymentId: string) {
    if (expandedLog === deploymentId) {
      setExpandedLog(null);
      return;
    }
    setExpandedLog(deploymentId);
    fetchBuildLog(deploymentId);
  }

  function copyLogs(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasActiveBuilds = deployments.some(d => d.state === 'BUILDING' || d.state === 'INITIALIZING');
  const errorCount = deployments.filter(d => d.state === 'ERROR').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 text-slate-900 dark:text-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">Deployments</h1>
              {errorCount > 0 && (
                <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-medium px-2.5 py-1 rounded-full">
                  {errorCount} error{errorCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {lastUpdated ? `Updated ${timeAgo(lastUpdated.getTime())}` : 'Loading...'}
              {hasActiveBuilds && (
                <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">
                  - Builds in progress
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={projectFilter}
              onChange={e => setProjectFilter(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={stateFilter}
              onChange={e => setStateFilter(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              <option value="">All States</option>
              <option value="BUILDING">Building</option>
              <option value="READY">Ready</option>
              <option value="ERROR">Error</option>
              <option value="QUEUED">Queued</option>
              <option value="CANCELED">Canceled</option>
            </select>
            <button
              onClick={() => { setLoading(true); fetchDeployments(); }}
              className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-lg p-4 mb-4 text-red-700 dark:text-red-400 text-sm font-mono whitespace-pre-wrap break-all">
            {error}
          </div>
        )}

        {/* Deployment list */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          {/* Desktop header */}
          <div className="hidden md:flex items-center border-b border-gray-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <div className="px-5 py-3 w-[120px] shrink-0">Status</div>
            <div className="px-5 py-3 w-[150px] shrink-0">Project</div>
            <div className="px-5 py-3 w-[100px] shrink-0">Branch</div>
            <div className="px-5 py-3 flex-1 min-w-0">Commit</div>
            <div className="px-5 py-3 w-[100px] shrink-0">Env</div>
            <div className="px-5 py-3 w-[80px] shrink-0">Age</div>
            <div className="px-5 py-3 w-[80px] shrink-0">Duration</div>
            <div className="px-5 py-3 w-[60px] shrink-0">Logs</div>
          </div>

          {loading && deployments.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-400 dark:text-slate-500">Loading deployments...</div>
          ) : deployments.length === 0 ? (
            <div className="px-5 py-12 text-center text-slate-400 dark:text-slate-500">No deployments found</div>
          ) : deployments.map(d => {
            const style = STATE_STYLES[d.state] || STATE_STYLES.CANCELED;
            const isExpanded = expandedLog === d.uid;
            const isError = d.state === 'ERROR';
            return (
              <div key={d.uid} className={`border-b border-gray-200 dark:border-slate-700 last:border-b-0 ${isError ? 'bg-red-50/50 dark:bg-red-900/10' : ''}`}>
                {/* Desktop row */}
                <div
                  className={`hidden md:flex items-center hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-50/50 dark:bg-slate-700/30' : ''}`}
                  onClick={() => toggleBuildLog(d.uid)}
                >
                  <div className="px-5 py-3 w-[120px] shrink-0">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${style.animate ? 'animate-pulse' : ''}`} />
                      {d.state}
                    </span>
                  </div>
                  <div className="px-5 py-3 font-medium text-sm w-[150px] shrink-0 truncate">{d.name}</div>
                  <div className="px-5 py-3 text-sm w-[100px] shrink-0">
                    <code className="bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-xs">
                      {d.meta?.githubCommitRef || '-'}
                    </code>
                  </div>
                  <div className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400 flex-1 min-w-0 truncate">
                    {d.meta?.githubCommitSha && (
                      <code className="text-blue-500 text-xs mr-1.5">{d.meta.githubCommitSha.slice(0, 7)}</code>
                    )}
                    {d.meta?.githubCommitMessage || '-'}
                  </div>
                  <div className="px-5 py-3 w-[100px] shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      d.target === 'production'
                        ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      {d.target || 'preview'}
                    </span>
                  </div>
                  <div className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap w-[80px] shrink-0">{timeAgo(d.created)}</div>
                  <div className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400 whitespace-nowrap w-[80px] shrink-0">{buildDuration(d)}</div>
                  <div className="px-5 py-3 w-[60px] shrink-0 flex items-center justify-center">
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Mobile row */}
                <div className="md:hidden p-4 cursor-pointer" onClick={() => toggleBuildLog(d.uid)}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{d.name}</span>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${style.animate ? 'animate-pulse' : ''}`} />
                      {d.state}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex justify-between">
                      <span>Branch</span>
                      <code className="bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">{d.meta?.githubCommitRef || '-'}</code>
                    </div>
                    <div className="flex justify-between">
                      <span>Env</span>
                      <span className={`px-2 py-0.5 rounded ${
                        d.target === 'production'
                          ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                      }`}>{d.target || 'preview'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Age</span>
                      <span>{timeAgo(d.created)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Duration</span>
                      <span>{buildDuration(d)}</span>
                    </div>
                    {d.meta?.githubCommitMessage && (
                      <p className="pt-1 text-slate-400 truncate">{d.meta.githubCommitMessage}</p>
                    )}
                  </div>
                  <div className="flex items-center justify-end mt-2">
                    <span className="text-slate-400 text-xs">
                      {isExpanded ? 'tap to collapse' : 'tap for logs'}
                    </span>
                  </div>
                </div>

                {/* Build logs panel */}
                {isExpanded && (
                  <div className="border-t border-gray-200 dark:border-slate-700 bg-slate-900 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">Build Output</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyLogs(buildLogs[d.uid] || ''); }}
                        className="text-slate-400 hover:text-white text-xs transition-colors flex items-center gap-1"
                      >
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="font-mono text-xs leading-relaxed max-h-[500px] overflow-auto rounded-lg bg-slate-950 p-3">
                      {logLoading === d.uid ? (
                        <div className="text-slate-400 animate-pulse">Loading build logs...</div>
                      ) : (
                        <pre className="whitespace-pre-wrap break-all text-green-400">
                          {buildLogs[d.uid] || 'No logs available'}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs text-slate-400 dark:text-slate-600">
          Auto-refreshes every 15s - {deployments.length} deployments - click any row for build logs
        </div>
      </div>
    </div>
  );
}
