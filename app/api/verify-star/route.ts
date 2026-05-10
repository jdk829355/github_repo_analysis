import { NextRequest, NextResponse } from 'next/server';
import {
  VERIFICATION_REPO_NAME,
  VERIFICATION_REPO_OWNER,
  VERIFICATION_REPO_URL,
} from '../../../lib/constants';
import { GitHubAPIError } from '../../../lib/errors';
import { normalizeGitHubUrl } from '../../../lib/utils';
import { getUserProfile, hasUserStarredRepository } from '../../../services/github-client';

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
      const message = error instanceof Error ? error.message : 'Invalid URL';
      return NextResponse.json({ error: message }, { status: 400 });
    }

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
          return NextResponse.json(
            { error: 'GitHub API rate limit exceeded' },
            { status: 429, headers: { 'Retry-After': '60' } }
          );
        }
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
