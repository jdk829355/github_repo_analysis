import { z } from 'zod';
import { RoleSchema } from '../prompts/types';

export const ProfileReportSchema = z.object({
  overallSummary: z.string(),
  roleEstimation: z.object({
    primary: RoleSchema,
    secondary: z.array(RoleSchema),
    recommended: z.array(z.string()),
  }),
  engineeringStrengths: z.array(z.string()),
  collaborationPatterns: z.array(z.string()),
  greenFlags: z.array(z.string()),
  redFlags: z.array(z.string()),
});

export type ProfileReport = z.infer<typeof ProfileReportSchema>;
