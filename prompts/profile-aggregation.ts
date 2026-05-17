import { ProfileAggregationInputSchema } from './types';
import type { z } from 'zod';

type ProfileAggregationInput = z.infer<typeof ProfileAggregationInputSchema>;

const SYSTEM_PROMPT = `You are an expert at synthesizing multiple repository analyses into a coherent developer profile.
Your task is to combine evidence from multiple repository analyses to produce a comprehensive, evidence-based, critically balanced profile.`;

const ANTI_HALLUCINATION = `## ANTI-HALLUCINATION INSTRUCTIONS
CRITICAL: You must ONLY report what can be verified from the provided repository analyses.
- Synthesize based ONLY on the actual analysis results provided
- Never invent or assume technologies, roles, or contributions not present in the inputs
- When aggregating roles, consider frequency and consistency across repositories
- If inputs conflict, acknowledge the discrepancy rather than picking one arbitrarily
- Every claim must be supported by fact in at least one repository analysis
- When data is sparse, indicate that the profile is based on limited information`;

const SYNTHESIS_INSTRUCTIONS = `## SYNTHESIS INSTRUCTIONS
1. Look for PATTERNS across repositories: consistent tech stack, recurring roles
2. Identify EXPERTISE areas: which technologies appear most frequently
3. Determine LEADERSHIP: who shows architecture decisions, mentoring, or maintainer activity
4. Assess VERSATILITY: breadth vs depth of experience
5. Note COLLABORATION patterns: how developer collaborates with others
6. Identify GAPS and WEAKNESSES: missing test coverage, lack of documentation, narrow tech stack, absence of observability/monitoring, missing CI/CD practices, or any areas where the developer could improve
7. Separate positive evidence into greenFlags and cautionary evidence into redFlags`;

const BALANCED_PERSPECTIVE = `## BALANCED PERSPECTIVE INSTRUCTIONS
The overallSummary must provide a HONEST and BALANCED assessment. Do NOT only praise the developer.
- Highlight genuine strengths with specific evidence
- Also identify concrete weaknesses, gaps, or areas for improvement
- If the developer repeats similar projects without expanding skills, note the lack of breadth
- If testing, documentation, or DevOps practices are missing, explicitly mention these gaps
- If commit messages are poor or collaboration signals are weak, state this factually
- Frame weaknesses as constructive observations, not insults
- greenFlags should be evidence-backed reasons to trust or positively evaluate this developer
- redFlags should be evidence-backed risks, missing signals, inconsistencies, or limitations
- Do not make redFlags artificially empty; if evidence is sparse, include that as a caution
- Do not exaggerate redFlags beyond the input evidence`;


const OUTPUT_FORMAT = `## OUTPUT FORMAT
Respond ONLY with valid JSON matching this exact schema.
IMPORTANT: All text values must be written in Korean (한글).
- overallSummary: comprehensive description of the developer in Korean
- collaborationPatterns: collaboration patterns described in Korean
- greenFlags: positive evidence signals in Korean
- redFlags: critical risk/gap signals in Korean
- All other string values should also be in Korean where possible

Schema:
{
  "overallSummary": "string - comprehensive description of the developer in Korean",
  "roleEstimation": {
    "primary": "string - main role (Backend, Frontend, DevOps, ML, Technical Lead, Maintainer, Architecture Contributor)",
    "secondary": ["string - supporting roles"],
    "recommended": ["string - suggested job roles based on profile"]
  },
  "engineeringStrengths": ["string - key technical strengths identified in Korean"],
  "collaborationPatterns": ["string - how developer collaborates with others in Korean"],
  "greenFlags": ["string - evidence-backed positive signals in Korean"],
  "redFlags": ["string - evidence-backed concerns, gaps, or risks in Korean"]
}

Do NOT include any text outside the JSON object.`;

function buildUserPrompt(input: ProfileAggregationInput): string {
  let prompt = `Analyze the GitHub profile for user: ${input.username}\n\n`;
  prompt += `This profile contains ${input.repositoryAnalyses.length} repository analysis(ies).\n\n`;

  prompt += `## Repository Analyses\n\n`;

  for (const repo of input.repositoryAnalyses) {
    prompt += `--- ${repo.repositoryName} ---\n`;
    prompt += `Type: ${repo.projectType} | Roles: ${repo.estimatedRoles.join(', ')} | Confidence: ${repo.confidence}\n`;
    prompt += `Tech: ${repo.techStack.join(', ')} | Contributions: ${repo.mainContributions.join(', ')}\n`;
    prompt += `Leadership signals: ${repo.leadershipSignals.join(', ') || 'None observed'}\n`;
    prompt += `Summary: ${repo.summary.substring(0, 200)}\n\n`;
  }

  prompt += `Based on all repository analyses above, synthesize a comprehensive developer profile with explicit green flags and red flags.\n`;

  return prompt;
}

export const profileAggregation = {
  render(input: ProfileAggregationInput): string {
    const parsed = ProfileAggregationInputSchema.parse(input);
    const userPrompt = buildUserPrompt(parsed);

    return `${SYSTEM_PROMPT}

${ANTI_HALLUCINATION}

${SYNTHESIS_INSTRUCTIONS}

${BALANCED_PERSPECTIVE}

${OUTPUT_FORMAT}

${userPrompt}

Synthesize and respond with JSON only.`;
  },
};
