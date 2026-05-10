import { RepositoryAnalysisInputSchema } from './types';
import type { z } from 'zod';

type RepositoryAnalysisInput = z.infer<typeof RepositoryAnalysisInputSchema>;

const SYSTEM_PROMPT = `You are an expert software engineer analyzing a GitHub repository.
Your task is to analyze the user's role in this repository based primarily on their commit history, then provide structured insights about the developer's work.

## ROLE SIGNALS TO LOOK FOR
When analyzing, identify these specific roles based on evidence:
- Backend: API design, server-side logic, database work, microservices
- Frontend: UI/UX implementation, React/Vue/Angular, styling, client-side logic
- DevOps: CI/CD pipelines, Docker, Kubernetes, infrastructure, deployment
- ML: Machine learning models, data pipelines, AI integration, model training
- Technical Lead: Architecture decisions, technical planning, code review, mentoring
- Maintainer: Long-term project stewardship, issue triage, community management
- Architecture Contributor: System design, scalable architectures, technical standards`;

const ANTI_HALLUCINATION = `## ANTI-HALLUCINATION INSTRUCTIONS
CRITICAL: You must ONLY report what can be verified from the provided evidence.
- If evidence is insufficient, say "Insufficient data" rather than guessing
- Never invent technologies, features, or contributions that are not present
- Only claim a role if there is CLEAR EVIDENCE supporting it
- When confidence is low, acknowledge uncertainty
- Every claim must be traceable to specific fact in the input`;

const OUTPUT_FORMAT = `## OUTPUT FORMAT
Respond ONLY with valid JSON matching this exact schema.
IMPORTANT: All text values must be written in Korean (한글).
- summary: concise role analysis for this user in this repository in Korean. This will be shown in the report under the pinned repository instead of the GitHub repository description.
- mainContributions: specific features or work items identified in Korean
- techStack: technologies explicitly mentioned in evidence (can be in English if they are proper nouns)
- leadershipSignals: evidence of technical leadership or mentorship in Korean

Schema:
{
  "repositoryName": "string - exact name from input",
  "summary": "string - concise analysis of the user's role in this repository based on commit logs, written in Korean",
  "projectType": "string - e.g., web-app, library, CLI tool, mobile-app, API",
  "estimatedRoles": ["Backend", "Frontend", etc. - from role signals above],
  "mainContributions": ["string - specific features or work items identified in Korean"],
  "techStack": ["string - technologies explicitly mentioned in evidence"],
  "leadershipSignals": ["string - evidence of technical leadership or mentorship in Korean"],
  "confidence": number - 0.0 to 1.0, how certain you are about this analysis
}

Do NOT include any text outside the JSON object.`;

function buildUserPrompt(input: RepositoryAnalysisInput): string {
  let prompt = `Analyze this GitHub repository:\n\n`;
  prompt += `Repository: ${input.repositoryName}\n\n`;

  if (input.description) {
    prompt += `Description: ${input.description}\n`;
  }
  if (input.primaryLanguage) {
    prompt += `Primary Language: ${input.primaryLanguage}\n`;
  }
  if (input.stars !== undefined) {
    prompt += `Stars: ${input.stars}\n`;
  }
  if (input.forks !== undefined) {
    prompt += `Forks: ${input.forks}\n`;
  }
  prompt += `\n`;

  if (input.readme) {
    prompt += `README:\n${input.readme}\n\n`;
  }

  if (input.commitLogs && input.commitLogs.length > 0) {
    prompt += `Commit History:\n`;
    for (const commit of input.commitLogs) {
      prompt += `- [${commit.date}] ${commit.author}: ${commit.message}\n`;
    }
    prompt += `\n`;
  }

  prompt += `Based on the evidence above, especially the commit history authored by this user, identify the user's role in this repository, their concrete contributions, the project type, tech stack, and any leadership signals.\n`;

  return prompt;
}

export const repositoryAnalysis = {
  render(input: RepositoryAnalysisInput): string {
    const parsed = RepositoryAnalysisInputSchema.parse(input);
    const userPrompt = buildUserPrompt(parsed);

    return `${SYSTEM_PROMPT}

${ANTI_HALLUCINATION}

${OUTPUT_FORMAT}

${userPrompt}

Analyze the user's role in this repository and respond with JSON only.`;
  },
};
