import { getGitHubToken } from '../lib/config';
import { GitHubAPIError } from '../lib/errors';
import {
  MAX_REPOS,
  MAX_COMMITS_PER_REPO,
  GITHUB_API_VERSION,
} from '../lib/constants';
import { truncateToMaxSize } from '../lib/utils';

const GITHUB_API_BASE = 'https://api.github.com';
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 100;
const MAX_PER_PAGE = 100;

interface RequestOptions {
  method?: string;
  body?: string;
}

function getHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getGitHubToken()}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(statusCode: number, rateLimitRemaining: string | null): boolean {
  if (statusCode === 500 || statusCode === 502 || statusCode === 503) {
    return true;
  }
  if (statusCode === 403) {
    const remaining = rateLimitRemaining ? parseInt(rateLimitRemaining, 10) : NaN;
    if (!isNaN(remaining) && remaining === 0) {
      return true;
    }
  }
  return false;
}

async function githubRequest(
  endpoint: string,
  options: RequestOptions = {}
): Promise<unknown> {
  let lastError: GitHubAPIError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
        method: options.method || 'GET',
        headers: getHeaders(),
        body: options.body,
      });

      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          typeof errorData === 'object' && errorData !== null && 'message' in errorData
            ? String(errorData.message)
            : `HTTP ${response.status}`;

        if (isRetryableError(response.status, rateLimitRemaining) && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }

        if (response.status === 404 && /^\/users\/[^\/]+$/.test(endpoint)) {
          throw new GitHubAPIError('Profile not found', response.status, endpoint);
        }

        throw new GitHubAPIError(message, response.status, endpoint);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        lastError = error;
        if (attempt < MAX_RETRIES && isRetryableError(error.statusCode, null)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }
      throw error;
    }
  }

  throw lastError || new GitHubAPIError('Request failed after max retries', 0, endpoint);
}

export async function getUserProfile(username: string): Promise<Record<string, unknown>> {
  const data = await githubRequest(`/users/${encodeURIComponent(username)}`);
  return data as Record<string, unknown>;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  updated_at: string;
  pushed_at: string | null;
  fork: boolean;
  archived: boolean;
  size: number;
  owner?: string;
}

interface RepositoriesResult {
  repositories: Repository[];
  filteredCount: number;
}

function shouldFilterRepo(repo: Repository): boolean {
  return repo.fork || repo.archived || repo.size === 0;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string; type?: string }>;
}

async function githubGraphQLRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  let lastError: GitHubAPIError | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${GITHUB_API_BASE}/graphql`, {
        method: 'POST',
        headers: {
          ...getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          typeof errorData === 'object' && errorData !== null && 'message' in errorData
            ? String(errorData.message)
            : `HTTP ${response.status}`;

        if (isRetryableError(response.status, rateLimitRemaining) && attempt < MAX_RETRIES) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }

        throw new GitHubAPIError(message, response.status, '/graphql');
      }

      const json = (await response.json()) as GraphQLResponse<T>;

      if (json.errors && json.errors.length > 0) {
        throw new GitHubAPIError(json.errors[0].message, 400, '/graphql');
      }

      if (!json.data) {
        throw new GitHubAPIError('GraphQL returned no data', 500, '/graphql');
      }

      return json.data;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        lastError = error;
        if (attempt < MAX_RETRIES && isRetryableError(error.statusCode, null)) {
          const delay = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
          continue;
        }
      }
      throw error;
    }
  }

  throw lastError || new GitHubAPIError('GraphQL request failed after max retries', 0, '/graphql');
}

interface PinnedRepoNode {
  name: string;
  owner: { login: string };
  description: string | null;
  primaryLanguage: { name: string } | null;
  stargazerCount: number;
  forkCount: number;
  updatedAt: string;
  isFork: boolean;
  isArchived: boolean;
  diskUsage: number;
}

export async function getUserPinnedRepositories(
  username: string
): Promise<RepositoriesResult> {
  const query = `
    query($username: String!) {
      user(login: $username) {
        pinnedItems(first: 6, types: REPOSITORY) {
          nodes {
            ... on Repository {
              name
              owner { login }
              description
              primaryLanguage { name }
              stargazerCount
              forkCount
              updatedAt
              isFork
              isArchived
              diskUsage
            }
          }
        }
      }
    }
  `;

  const data = await githubGraphQLRequest<{
    user: {
      pinnedItems: {
        nodes: PinnedRepoNode[];
      };
    };
  }>(query, { username });

  const repositories: Repository[] = [];
  let filteredCount = 0;

  for (const repo of data.user.pinnedItems.nodes) {
    const owner = repo.owner.login;
    const mappedRepo: Repository = {
      id: 0,
      name: repo.name,
      full_name: `${owner}/${repo.name}`,
      description: repo.description,
      html_url: `https://github.com/${owner}/${repo.name}`,
      language: repo.primaryLanguage?.name || null,
      stargazers_count: repo.stargazerCount,
      forks_count: repo.forkCount,
      open_issues_count: 0,
      created_at: repo.updatedAt,
      updated_at: repo.updatedAt,
      pushed_at: null,
      fork: repo.isFork,
      archived: repo.isArchived,
      size: repo.diskUsage * 1024,
      owner,
    };

    if (shouldFilterRepo(mappedRepo)) {
      filteredCount++;
      continue;
    }

    repositories.push(mappedRepo);
  }

  return { repositories, filteredCount };
}

export async function getUserRepositories(
  username: string
): Promise<RepositoriesResult> {
  const repositories: Repository[] = [];
  let filteredCount = 0;
  let page = 1;

  while (repositories.length < MAX_REPOS) {
    const endpoint = `/users/${encodeURIComponent(username)}/repos?per_page=${MAX_PER_PAGE}&page=${page}&sort=updated&direction=desc`;
    const data = await githubRequest(endpoint);
    const pageRepos = data as Repository[];

    if (!Array.isArray(pageRepos) || pageRepos.length === 0) {
      break;
    }

    for (const repo of pageRepos) {
      if (shouldFilterRepo(repo)) {
        filteredCount++;
        continue;
      }

      repositories.push(repo);

      if (repositories.length >= MAX_REPOS) {
        break;
      }
    }

    if (pageRepos.length < MAX_PER_PAGE) {
      break;
    }

    page++;
  }

  return { repositories, filteredCount };
}

export async function getRepository(
  owner: string,
  repo: string
): Promise<Repository> {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const data = await githubRequest(endpoint);
  return data as Repository;
}

export async function getRepositoryReadme(
  owner: string,
  repo: string
): Promise<string> {
  const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`;
  const data = await githubRequest(endpoint);

  const readmeData = data as { content?: string; encoding?: string };

  if (readmeData.content && readmeData.encoding === 'base64') {
    const decoded = Buffer.from(readmeData.content, 'base64').toString('utf-8');
    return truncateToMaxSize(decoded, 10240);
  }

  return '';
}

interface Commit {
  sha: string;
  commit: {
    message: string;
    author: {
      date: string;
    };
  };
  author: {
    login: string;
  } | null;
}

export async function getRepositoryCommits(
  owner: string,
  repo: string,
  username?: string
): Promise<Commit[]> {
  const commits: Commit[] = [];
  let page = 1;
  const author = username || owner;

  while (commits.length < MAX_COMMITS_PER_REPO) {
    const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${MAX_PER_PAGE}&page=${page}&author=${encodeURIComponent(author)}`;
    const data = await githubRequest(endpoint);
    const pageCommits = data as Commit[];

    if (!Array.isArray(pageCommits) || pageCommits.length === 0) {
      break;
    }

    commits.push(...pageCommits);

    if (commits.length > MAX_COMMITS_PER_REPO) {
      commits.length = MAX_COMMITS_PER_REPO;
      break;
    }

    if (pageCommits.length < MAX_PER_PAGE) {
      break;
    }

    page++;
  }

  return commits;
}
