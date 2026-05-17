import { z } from 'zod';

/**
 * Role signals extracted from repository analysis
 * @see PRD Section 7: Role Estimation Rules
 */
export const RoleSchema = z.string();

export type Role = string;

/**
 * Repository Analysis Output Schema
 * @see PRD Section 14: LLM Processing Pipeline - Step 1
 */
export const RepositoryAnalysisSchema = z.object({
  repositoryName: z.string().describe('Name of the repository'),
  summary: z.string().describe('Concise role analysis for the user in this repository'),
  projectType: z.string().describe('Type of project (e.g., web-app, library, CLI tool, mobile-app)'),
  estimatedRoles: z.array(RoleSchema).describe('Roles inferred from commit patterns and README'),
  mainContributions: z.array(z.string()).describe('Key contributions or features implemented'),
  techStack: z.array(z.string()).describe('Technologies and frameworks used'),
  leadershipSignals: z.array(z.string()).describe('Evidence of technical leadership or mentorship'),
  confidence: z.number().min(0).max(1).describe('Confidence score for this analysis'),
});

export type RepositoryAnalysis = z.infer<typeof RepositoryAnalysisSchema>;

/**
 * Profile Aggregation Output Schema
 * @see PRD Section 14: LLM Processing Pipeline - Step 2
 */
export const ProfileAggregationSchema = z.object({
  overallSummary: z.string().describe('Comprehensive summary of the developer profile'),
  roleEstimation: z.object({
    primary: RoleSchema.describe('Main role based on repository analysis'),
    secondary: z.array(RoleSchema).describe('Supporting roles'),
  }),
  engineeringStrengths: z.array(z.string()).describe('Key technical strengths identified'),
  collaborationPatterns: z.array(z.string()).describe('How the developer collaborates with others'),
  greenFlags: z.array(z.string()).describe('Evidence-backed positive hiring or collaboration signals'),
  redFlags: z.array(z.string()).describe('Evidence-backed risks, gaps, or cautionary signals'),
  recommendedRoles: z.array(z.string()).describe('Suggested roles based on profile analysis'),
});

export type ProfileAggregation = z.infer<typeof ProfileAggregationSchema>;

/**
 * Repository Analysis Input - data passed to the LLM
 */
export const RepositoryAnalysisInputSchema = z.object({
  repositoryName: z.string(),
  description: z.string().optional(),
  primaryLanguage: z.string().optional(),
  stars: z.number().optional(),
  forks: z.number().optional(),
  readme: z.string().optional(),
  commitLogs: z.array(z.object({
    message: z.string(),
    date: z.string(),
    author: z.string(),
  })).optional(),
});

export type RepositoryAnalysisInput = z.infer<typeof RepositoryAnalysisInputSchema>;

/**
 * Profile Aggregation Input - array of repository analyses
 */
export const ProfileAggregationInputSchema = z.object({
  username: z.string(),
  repositoryAnalyses: z.array(RepositoryAnalysisSchema),
});

export type ProfileAggregationInput = z.infer<typeof ProfileAggregationInputSchema>;
