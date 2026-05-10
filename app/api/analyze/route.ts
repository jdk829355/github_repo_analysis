import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { normalizeGitHubUrl } from '../../../lib/utils';
import { GitHubAPIError } from '../../../lib/errors';
import { getUserProfile } from '../../../services/github-client';
import { checkJobDeduplication, setJobActive } from '../../../services/cache';
import { analysisQueue } from '../../../workers/analysis-worker';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { url } = body as Record<string, unknown>;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    let normalizedUrl: string;

    try {
      normalizedUrl = normalizeGitHubUrl(url);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Invalid URL';
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const username = new URL(normalizedUrl).pathname.slice(1);

    try {
      await getUserProfile(username);
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        if (error.statusCode === 404) {
          return NextResponse.json(
            { error: 'GitHub profile not found' },
            { status: 404 }
          );
        }
        if (error.statusCode === 403) {
          return NextResponse.json(
            { error: 'GitHub API rate limit exceeded' },
            { status: 429, headers: { 'Retry-After': '60' } }
          );
        }
      }
      throw error;
    }

    const existingJobId = await checkJobDeduplication(normalizedUrl);
    if (existingJobId) {
      const job = await prisma.analysis_jobs.findUnique({
        where: { id: existingJobId },
      });

      if (job) {
        return NextResponse.json(
          { jobId: job.id, status: job.status },
          { status: 200 }
        );
      }
    }

    const job = await prisma.analysis_jobs.create({
      data: {
        github_profile: normalizedUrl,
        status: 'PENDING',
      },
    });

    await setJobActive(normalizedUrl, job.id);

    await analysisQueue.add(
      'analyze',
      { username, githubUrl: normalizedUrl },
      { jobId: job.id }
    );

    return NextResponse.json(
      { jobId: job.id, status: job.status },
      { status: 202 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
