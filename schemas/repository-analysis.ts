import { z } from 'zod';

export const RepositoryAnalysisSchema = z.object({
  repositoryName: z.string(),
  summary: z.string(),
  projectType: z.string(),
  estimatedRoles: z.array(z.string()),
  mainContributions: z.array(z.string()),
  techStack: z.array(z.string()),
  leadershipSignals: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

export type RepositoryAnalysis = z.infer<typeof RepositoryAnalysisSchema>;
