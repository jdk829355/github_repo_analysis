import { NextRequest, NextResponse } from 'next/server';
import {
  VERIFICATION_REPO_NAME,
  VERIFICATION_REPO_OWNER,
  VERIFICATION_REPO_URL,
} from '../../../lib/constants';
import { GitHubAPIError, INTERNAL_ERROR_MESSAGE } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { parseJsonBody } from '../../../lib/parse-json-body';
import { GitHubUrlRequestSchema } from '../../../schemas/github-url-request';
import { getUserProfile, hasUserStarredRepository } from '../../../services/github-client';

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
            verified: false,
            error: `${VERIFICATION_REPO_URL} 저장소의 star 목록에서 ${username} 계정을 찾지 못했습니다.`,
            repositoryUrl: VERIFICATION_REPO_URL,
          },
          { status: 403 }
        );
      }

      return NextResponse.json({
        verified: true,
        username,
        repositoryUrl: VERIFICATION_REPO_URL,
      });
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
            { event: 'api.error', route: '/api/verify-star', status: 502, err: error },
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
  } catch (error) {
    logger.error(
      { event: 'api.error', route: '/api/verify-star', status: 500, err: error },
      'API request failed'
    );
    return NextResponse.json({ error: INTERNAL_ERROR_MESSAGE }, { status: 500 });
  }
}
