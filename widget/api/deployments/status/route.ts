import { NextResponse } from 'next/server';

const VERCEL_TOKEN = process.env.VDW_VERCEL_TOKEN;
const TEAM_ID = process.env.VDW_VERCEL_TEAM_ID;
const PROJECT_ID = process.env.VDW_VERCEL_PROJECT_ID;

export const dynamic = 'force-dynamic';

export type DeploymentStatusPayload = {
  ok: boolean;
  /** Vercel state: READY, BUILDING, ERROR, QUEUED, INITIALIZING, CANCELED */
  readyState: string | null;
  state: string | null;
  createdAt: string | null;
  /** When the deployment finished (READY/ERROR) */
  readyAt: string | null;
  url: string | null;
  gitSource?: { ref?: string; sha?: string; message?: string } | null;
};

/**
 * GET /api/deployments/status
 *
 * Returns the latest deployment for your project.
 * No auth by default - add your own middleware if needed.
 *
 * Required env vars: VDW_VERCEL_TOKEN, VDW_VERCEL_TEAM_ID, VDW_VERCEL_PROJECT_ID
 */
export async function GET() {
  // ------------------------------------------------------------------
  // Auth: Add your own authentication here if you want to protect this
  // endpoint. For example, check a session cookie or API key.
  // ------------------------------------------------------------------

  if (!VERCEL_TOKEN || !TEAM_ID || !PROJECT_ID) {
    return NextResponse.json({
      data: {
        ok: false,
        readyState: null,
        state: null,
        createdAt: null,
        readyAt: null,
        url: null,
        error: 'Vercel env not configured (VDW_VERCEL_TOKEN, VDW_VERCEL_TEAM_ID, VDW_VERCEL_PROJECT_ID)',
      } satisfies DeploymentStatusPayload & { error?: string },
    });
  }

  try {
    const params = new URLSearchParams({
      teamId: TEAM_ID,
      projectId: PROJECT_ID,
      limit: '1',
    });
    const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json({
        data: {
          ok: false,
          readyState: null,
          state: null,
          createdAt: null,
          readyAt: null,
          url: null,
          error: `Vercel API ${res.status}`,
        },
      });
    }

    const data = (await res.json()) as { deployments?: Array<Record<string, unknown>> };
    const d = data.deployments?.[0];
    if (!d) {
      return NextResponse.json({
        data: {
          ok: true,
          readyState: null,
          state: null,
          createdAt: null,
          readyAt: null,
          url: null,
        } satisfies DeploymentStatusPayload,
      });
    }

    const readyState = typeof d.readyState === 'string' ? d.readyState : null;
    const state = typeof d.state === 'string' ? d.state : null;
    const createdRaw = d.createdAt;
    const createdAt =
      typeof createdRaw === 'number'
        ? new Date(createdRaw).toISOString()
        : typeof createdRaw === 'string'
          ? createdRaw
          : null;
    const readyRaw = d.ready;
    const readyAt = typeof readyRaw === 'number' ? new Date(readyRaw).toISOString() : null;
    const url = typeof d.url === 'string' ? `https://${d.url}` : null;
    const meta = (d.meta || {}) as Record<string, unknown>;
    const commitMessage = [meta.githubCommitMessage, meta.gitCommitMessage, meta.commitMessage].find(
      (v): v is string => typeof v === 'string' && v.trim().length > 0,
    );
    const gitSource = {
      ref: typeof meta.githubCommitRef === 'string' ? meta.githubCommitRef : undefined,
      sha: typeof meta.githubCommitSha === 'string' ? meta.githubCommitSha : undefined,
      message: commitMessage,
    };

    const payload: DeploymentStatusPayload = {
      ok: true,
      readyState,
      state,
      createdAt,
      readyAt,
      url,
      gitSource,
    };
    return NextResponse.json({ data: payload });
  } catch (e) {
    return NextResponse.json({
      data: {
        ok: false,
        readyState: null,
        state: null,
        createdAt: null,
        readyAt: null,
        url: null,
        error: e instanceof Error ? e.message : 'fetch failed',
      },
    });
  }
}
