import { NextResponse } from 'next/server';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const TEAM_ID = process.env.VERCEL_TEAM_ID;

export const dynamic = 'force-dynamic';

/**
 * GET /api/deployments
 *
 * List deployments, get build logs, or list projects.
 *
 * Query params:
 *   - deploymentId=xxx  - get build logs for a specific deployment
 *   - projects=1        - list all projects in the team
 *   - projectId=xxx     - filter deployments by project
 *   - state=ERROR       - filter deployments by state
 *
 * Required env vars: VERCEL_TOKEN, VERCEL_TEAM_ID
 */
export async function GET(request: Request) {
  if (!VERCEL_TOKEN || !TEAM_ID) {
    return NextResponse.json(
      { error: 'Vercel credentials not configured (VERCEL_TOKEN, VERCEL_TEAM_ID)' },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);

  // Get build logs for a specific deployment
  const deploymentId = searchParams.get('deploymentId');
  if (deploymentId) {
    const res = await fetch(
      `https://api.vercel.com/v3/deployments/${deploymentId}/events?teamId=${TEAM_ID}`,
      {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch build logs' }, { status: res.status });
    const events = await res.json();
    return NextResponse.json({ events });
  }

  // List all projects (for filter dropdown)
  const listProjects = searchParams.get('projects');
  if (listProjects === '1') {
    const res = await fetch(
      `https://api.vercel.com/v9/projects?teamId=${TEAM_ID}&limit=100`,
      {
        headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return NextResponse.json({ error: 'Failed to fetch projects' }, { status: res.status });
    const data = await res.json();
    return NextResponse.json({ projects: data.projects });
  }

  // List deployments
  const params = new URLSearchParams({ teamId: TEAM_ID, limit: '50' });
  const projectId = searchParams.get('projectId');
  const state = searchParams.get('state');
  if (projectId) params.set('projectId', projectId);
  if (state) params.set('state', state);

  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    cache: 'no-store',
  });

  if (!res.ok) return NextResponse.json({ error: 'Failed to fetch deployments' }, { status: res.status });
  const data = await res.json();
  return NextResponse.json(data);
}
