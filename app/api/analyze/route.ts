import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';
import { parseJsonBody } from '../../../lib/parse-json-body';
import { GitHubAPIError, INTERNAL_ERROR_MESSAGE } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { GitHubUrlRequestSchema } from '../../../schemas/github-url-request';
import {
  VERIFICATION_REPO_NAME,
  VERIFICATION_REPO_OWNER,
  VERIFICATION_REPO_URL,
} from '../../../lib/constants';
import { getUserProfile, hasUserStarredRepository } from '../../../services/github-client';
import { acquireJobActive, checkJobDeduplication, releaseJobActive } from '../../../services/cache';
import { analysisQueue } from '../../../lib/queue';

export async function POST(request: NextRequest) {
  try {
    const parsed = await parseJsonBody(request, GitHubUrlRequestSchema);
    if (!parsed.ok) {
      return parsed.response;
    }

    const normalizedUrl = parsed.data.url;
    const username = new URL(normalizedUrl).pathname.slice(1);

    try {
      await getUserProfile(username);
      const hasStarred = await hasUserStarredRepository(
        username,
        VERIFICATION_REPO_OWNER,
        VERIFICATION_REPO_NAME
      );

      if (!hasStarred) {
        return NextResponse.json(
          {
            error: `분석을 시작하려면 ${VERIFICATION_REPO_URL} 저장소에 star를 남긴 뒤 다시 검증해주세요.`,
          },
          { status: 403 }
        );
      }
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        if (error.statusCode === 404) {
          return NextResponse.json(
            { error: 'GitHub profile not found' },
            { status: 404 }
          );
        }
        if (error.statusCode === 403) {
          if (/rate limit/i.test(error.message)) {
            return NextResponse.json(
              { error: 'GitHub API rate limit exceeded' },
              { status: 429, headers: { 'Retry-After': '60' } }
            );
          }
          // 운영자가 토큰을 고쳐야 하는 문제라 error로 남긴다.
          logger.error(
            { event: 'api.error', route: '/api/analyze', status: 502, err: error },
            'GitHub token is missing a required permission'
          );
          return NextResponse.json(
            { error: '서버의 GitHub 토큰 권한을 확인해야 합니다.' },
            { status: 502 }
          );
        }
      }
      throw error;
    }

    const jobId = randomUUID();

    if (!(await acquireJobActive(normalizedUrl, jobId))) {
      const existingJobId = await checkJobDeduplication(normalizedUrl);
      if (existingJobId) {
        const existingJob = await prisma.analysis_jobs.findUnique({
          where: { id: existingJobId },
        });

        // 키를 잡은 요청이 아직 DB 행을 만들기 전이면 existingJob이 null이다.
        if (!existingJob || existingJob.status === 'PENDING' || existingJob.status === 'PROCESSING') {
          return NextResponse.json(
            { jobId: existingJobId, status: existingJob?.status ?? 'PENDING' },
            { status: 200 }
          );
        }

        await releaseJobActive(normalizedUrl, existingJobId);
      }

      if (!(await acquireJobActive(normalizedUrl, jobId))) {
        const winnerJobId = await checkJobDeduplication(normalizedUrl);
        if (winnerJobId) {
          return NextResponse.json(
            { jobId: winnerJobId, status: 'PENDING' },
            { status: 200 }
          );
        }
        throw new Error('Failed to acquire analysis job lock');
      }
    }

    let job;
    try {
      job = await prisma.analysis_jobs.create({
        data: {
          id: jobId,
          github_profile: normalizedUrl,
          status: 'PENDING',
        },
      });

      await analysisQueue.add(
        'analyze',
        { username, githubUrl: normalizedUrl },
        { jobId }
      );
    } catch (error) {
      await releaseJobActive(normalizedUrl, jobId);
      throw error;
    }

    return NextResponse.json(
      { jobId: job.id, status: job.status },
      { status: 202 }
    );
  } catch (error) {
    logger.error(
      { event: 'api.error', route: '/api/analyze', status: 500, err: error },
      'API request failed'
    );
    return NextResponse.json({ error: INTERNAL_ERROR_MESSAGE }, { status: 500 });
  }
}
