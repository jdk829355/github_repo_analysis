import { z } from 'zod';

const RepositoryAnalysisSchema = z.object({
  repositoryName: z.string(),
  summary: z.string(),
  projectType: z.string(),
  estimatedRoles: z.array(z.string()),
  mainContributions: z.array(z.string()),
  techStack: z.array(z.string()),
  leadershipSignals: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

const ProfileReportSchema = z.object({
  overallSummary: z.string(),
  roleEstimation: z.object({
    backend: z.number().min(0).max(1),
    frontend: z.number().min(0).max(1),
    devops: z.number().min(0).max(1),
    ml: z.number().min(0).max(1),
    technicalLead: z.boolean(),
    maintainer: z.boolean(),
    architectureContributor: z.boolean(),
  }),
  engineeringStrengths: z.array(z.string()),
  collaborationPatterns: z.array(z.string()),
});

describe('RepositoryAnalysisSchema', () => {
  const validRepositoryAnalysis = {
    repositoryName: 'my-repo',
    summary: 'A sample repository',
    projectType: 'web-application',
    estimatedRoles: ['Backend', 'Frontend'],
    mainContributions: ['API development', 'UI implementation'],
    techStack: ['TypeScript', 'React', 'Node.js'],
    leadershipSignals: ['Code review', 'Mentoring'],
    confidence: 0.85,
  };

  it('should pass with valid repository analysis data', () => {
    const result = RepositoryAnalysisSchema.safeParse(validRepositoryAnalysis);
    expect(result.success).toBe(true);
  });

  it('should fail when repositoryName is missing', () => {
    const invalid: Record<string, unknown> = { ...validRepositoryAnalysis };
    delete invalid.repositoryName;
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when summary is missing', () => {
    const invalid: Record<string, unknown> = { ...validRepositoryAnalysis };
    delete invalid.summary;
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when projectType is missing', () => {
    const invalid: Record<string, unknown> = { ...validRepositoryAnalysis };
    delete invalid.projectType;
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when estimatedRoles is not an array', () => {
    const invalid = { ...validRepositoryAnalysis, estimatedRoles: 'Backend' };
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when mainContributions is not an array', () => {
    const invalid = { ...validRepositoryAnalysis, mainContributions: 'API' };
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when techStack is not an array', () => {
    const invalid = { ...validRepositoryAnalysis, techStack: 'TypeScript' };
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when leadershipSignals is not an array', () => {
    const invalid = { ...validRepositoryAnalysis, leadershipSignals: 'Code review' };
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when confidence is less than 0', () => {
    const invalid = { ...validRepositoryAnalysis, confidence: -0.5 };
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when confidence is greater than 1', () => {
    const invalid = { ...validRepositoryAnalysis, confidence: 1.5 };
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when confidence is not a number', () => {
    const invalid = { ...validRepositoryAnalysis, confidence: 'high' };
    const result = RepositoryAnalysisSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should pass with empty arrays for optional array fields', () => {
    const data = {
      ...validRepositoryAnalysis,
      estimatedRoles: [],
      mainContributions: [],
      techStack: [],
      leadershipSignals: [],
    };
    const result = RepositoryAnalysisSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should pass with confidence of 0', () => {
    const data = { ...validRepositoryAnalysis, confidence: 0 };
    const result = RepositoryAnalysisSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should pass with confidence of 1', () => {
    const data = { ...validRepositoryAnalysis, confidence: 1 };
    const result = RepositoryAnalysisSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('ProfileReportSchema', () => {
  const validProfileReport = {
    overallSummary: 'An experienced full-stack developer',
    roleEstimation: {
      backend: 0.8,
      frontend: 0.6,
      devops: 0.4,
      ml: 0.2,
      technicalLead: true,
      maintainer: false,
      architectureContributor: true,
    },
    engineeringStrengths: ['System design', 'API development'],
    collaborationPatterns: ['Code review', 'Pair programming'],
  };

  it('should pass with valid profile report data', () => {
    const result = ProfileReportSchema.safeParse(validProfileReport);
    expect(result.success).toBe(true);
  });

  it('should fail when overallSummary is missing', () => {
    const invalid: Record<string, unknown> = { ...validProfileReport };
    delete invalid.overallSummary;
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when roleEstimation is missing', () => {
    const invalid: Record<string, unknown> = { ...validProfileReport };
    delete invalid.roleEstimation;
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when engineeringStrengths is missing', () => {
    const invalid: Record<string, unknown> = { ...validProfileReport };
    delete invalid.engineeringStrengths;
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when collaborationPatterns is missing', () => {
    const invalid: Record<string, unknown> = { ...validProfileReport };
    delete invalid.collaborationPatterns;
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when roleEstimation.backend is less than 0', () => {
    const invalid = {
      ...validProfileReport,
      roleEstimation: { ...validProfileReport.roleEstimation, backend: -0.1 },
    };
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when roleEstimation.frontend is greater than 1', () => {
    const invalid = {
      ...validProfileReport,
      roleEstimation: { ...validProfileReport.roleEstimation, frontend: 1.5 },
    };
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when roleEstimation.technicalLead is not a boolean', () => {
    const invalid = {
      ...validProfileReport,
      roleEstimation: { ...validProfileReport.roleEstimation, technicalLead: 'yes' },
    };
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when engineeringStrengths is not an array', () => {
    const invalid = { ...validProfileReport, engineeringStrengths: 'Strength' };
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should fail when collaborationPatterns is not an array', () => {
    const invalid = { ...validProfileReport, collaborationPatterns: 'Pattern' };
    const result = ProfileReportSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should pass with empty arrays for optional array fields', () => {
    const data = {
      ...validProfileReport,
      engineeringStrengths: [],
      collaborationPatterns: [],
    };
    const result = ProfileReportSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should pass with all roleEstimation values at 0', () => {
    const data = {
      ...validProfileReport,
      roleEstimation: {
        backend: 0,
        frontend: 0,
        devops: 0,
        ml: 0,
        technicalLead: false,
        maintainer: false,
        architectureContributor: false,
      },
    };
    const result = ProfileReportSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('should pass with all roleEstimation values at 1', () => {
    const data = {
      ...validProfileReport,
      roleEstimation: {
        backend: 1,
        frontend: 1,
        devops: 1,
        ml: 1,
        technicalLead: true,
        maintainer: true,
        architectureContributor: true,
      },
    };
    const result = ProfileReportSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});
