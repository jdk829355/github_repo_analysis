import { z } from 'zod';
import { normalizeGitHubUrl } from '../lib/utils';

export const GitHubUrlRequestSchema = z.object(
  {
    url: z
      .string({ error: 'URL is required' })
      .min(1, { error: 'URL is required', abort: true })
      .transform((value, ctx) => {
        try {
          return normalizeGitHubUrl(value);
        } catch (error) {
          ctx.issues.push({
            code: 'custom',
            message: error instanceof Error ? error.message : 'Invalid URL',
            input: value,
          });
          return z.NEVER;
        }
      }),
  },
  { error: 'Invalid request body' }
);

export type GitHubUrlRequest = z.infer<typeof GitHubUrlRequestSchema>;
