import {
  RepositoryAnalysisInputSchema,
  ProfileAggregationInputSchema,
  RepositoryAnalysisSchema,
  ProfileAggregationSchema,
  Role,
} from '../../prompts/types';

describe('prompts/types', () => {
  describe('RepositoryAnalysisInputSchema', () => {
    it('validates minimal repository input', () => {
      const input = {
        repositoryName: 'test-repo',
      };
      const result = RepositoryAnalysisInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('validates full repository input with all fields', () => {
      const input = {
        repositoryName: 'my-project',
        description: 'A test repository',
        primaryLanguage: 'TypeScript',
        stars: 100,
        forks: 20,
        readme: '# My Project\n\nThis is a test project.',
        commitLogs: [
          { message: 'feat: add user authentication', date: '2024-01-15', author: 'developer' },
          { message: 'fix: resolve login bug', date: '2024-01-16', author: 'developer' },
        ],
      };
      const result = RepositoryAnalysisInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects missing repositoryName', () => {
      const input = {
        description: 'Missing name',
      };
      const result = RepositoryAnalysisInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ProfileAggregationInputSchema', () => {
    it('validates profile aggregation input', () => {
      const input = {
        username: 'testuser',
        repositoryAnalyses: [
          {
            repositoryName: 'repo1',
            summary: 'Test repo',
            projectType: 'web-app',
            estimatedRoles: ['Backend'],
            mainContributions: ['API development'],
            techStack: ['Node.js'],
            leadershipSignals: [],
            confidence: 0.8,
          },
        ],
      };
      const result = ProfileAggregationInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('rejects missing username', () => {
      const input = {
        repositoryAnalyses: [],
      };
      const result = ProfileAggregationInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('RepositoryAnalysisSchema', () => {
    it('validates complete repository analysis output', () => {
      const output = {
        repositoryName: 'awesome-project',
        summary: 'A comprehensive project management tool',
        projectType: 'web-app',
        estimatedRoles: ['Backend', 'Technical Lead'] as Role[],
        mainContributions: [
          'Designed and implemented RESTful API',
          'Set up CI/CD pipeline',
        ],
        techStack: ['Node.js', 'PostgreSQL', 'Docker'],
        leadershipSignals: ['Code review initiation', 'Architecture decisions'],
        confidence: 0.85,
      };
      const result = RepositoryAnalysisSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('rejects confidence outside 0-1 range', () => {
      const output = {
        repositoryName: 'test',
        summary: 'test',
        projectType: 'test',
        estimatedRoles: [],
        mainContributions: [],
        techStack: [],
        leadershipSignals: [],
        confidence: 1.5,
      };
      const result = RepositoryAnalysisSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('accepts any string as role', () => {
      const output = {
        repositoryName: 'test',
        summary: 'test',
        projectType: 'test',
        estimatedRoles: ['AnyRoleString'],
        mainContributions: [],
        techStack: [],
        leadershipSignals: [],
        confidence: 0.5,
      };
      const result = RepositoryAnalysisSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  describe('ProfileAggregationSchema', () => {
    it('validates complete profile aggregation output', () => {
      const output = {
        overallSummary: 'Full-stack developer with strong backend expertise',
        roleEstimation: {
          primary: 'Backend' as Role,
          secondary: ['Frontend'] as Role[],
        },
        engineeringStrengths: [
          'Scalable API design',
          'Database optimization',
        ],
        collaborationPatterns: [
          'Active code reviewer',
          'Mentorship for junior developers',
        ],
        greenFlags: ['Strong backend evidence'],
        redFlags: ['Limited testing evidence'],
        recommendedRoles: ['Backend Engineer', 'Technical Lead'],
      };
      const result = ProfileAggregationSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('accepts any string as primary role', () => {
      const output = {
        overallSummary: 'test',
        roleEstimation: {
          primary: 'AnyRoleString',
          secondary: [],
        },
        engineeringStrengths: [],
        collaborationPatterns: [],
        greenFlags: [],
        redFlags: ['Evidence is sparse'],
        recommendedRoles: [],
      };
      const result = ProfileAggregationSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });
});

describe('prompts/repository-analysis', () => {
  const repositoryAnalysis = require('../../prompts/repository-analysis').repositoryAnalysis;

  it('exports a render function', () => {
    expect(typeof repositoryAnalysis.render).toBe('function');
  });

  it('render accepts input matching RepositoryAnalysisInputSchema', () => {
    const input = {
      repositoryName: 'my-repo',
      description: 'A test repository',
      primaryLanguage: 'TypeScript',
      stars: 50,
      forks: 10,
      readme: '# My Repo\n\nTest repository content',
      commitLogs: [
        { message: 'feat: initial commit', date: '2024-01-01', author: 'user' },
      ],
    };
    const result = repositoryAnalysis.render(input);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('render includes all required sections', () => {
    const input = {
      repositoryName: 'test-repo',
      readme: '# Test\n\nContent',
      commitLogs: [{ message: 'fix bug', date: '2024-01-01', author: 'dev' }],
    };
    const rendered = repositoryAnalysis.render(input);
    expect(rendered).toContain('repositoryName');
    expect(rendered).toContain('summary');
    expect(rendered).toContain('projectType');
    expect(rendered).toContain('estimatedRoles');
    expect(rendered).toContain('mainContributions');
    expect(rendered).toContain('techStack');
    expect(rendered).toContain('leadershipSignals');
    expect(rendered).toContain('confidence');
  });

  it('render includes anti-hallucination instructions', () => {
    const input = { repositoryName: 'test' };
    const rendered = repositoryAnalysis.render(input);
    expect(rendered.toLowerCase()).toContain('hallucin');
    expect(rendered.toLowerCase()).toContain('fact');
    expect(rendered.toLowerCase()).toContain('evidence');
  });

  it('render includes role signals list', () => {
    const input = { repositoryName: 'test' };
    const rendered = repositoryAnalysis.render(input);
    expect(rendered).toContain('Backend');
    expect(rendered).toContain('Frontend');
    expect(rendered).toContain('DevOps');
    expect(rendered).toContain('ML');
    expect(rendered).toContain('Technical Lead');
    expect(rendered).toContain('Maintainer');
    expect(rendered).toContain('Architecture Contributor');
  });

  it('render instructs the model to summarize the user role from commit history', () => {
    const input = {
      repositoryName: 'test-repo',
      commitLogs: [{ message: 'feat: implement auth API', date: '2024-01-01', author: 'dev' }],
    };
    const rendered = repositoryAnalysis.render(input);
    expect(rendered).toContain('commit history');
    expect(rendered).toContain("user's role");
    expect(rendered).toContain('instead of the GitHub repository description');
  });

  it('render includes output JSON format specification', () => {
    const input = { repositoryName: 'test' };
    const rendered = repositoryAnalysis.render(input);
    expect(rendered).toContain('{');
    expect(rendered).toContain('}');
    expect(rendered.toLowerCase()).toContain('json');
  });

  it('render handles missing optional fields', () => {
    const minimalInput = { repositoryName: 'minimal-repo' };
    const result = repositoryAnalysis.render(minimalInput);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('prompts/profile-aggregation', () => {
  const profileAggregation = require('../../prompts/profile-aggregation').profileAggregation;

  it('exports a render function', () => {
    expect(typeof profileAggregation.render).toBe('function');
  });

  it('render accepts input matching ProfileAggregationInputSchema', () => {
    const input = {
      username: 'testuser',
      repositoryAnalyses: [
        {
          repositoryName: 'repo1',
          summary: 'First repo',
          projectType: 'web-app',
          estimatedRoles: ['Backend'],
          mainContributions: ['API'],
          techStack: ['Node.js'],
          leadershipSignals: [],
          confidence: 0.8,
        },
        {
          repositoryName: 'repo2',
          summary: 'Second repo',
          projectType: 'CLI',
          estimatedRoles: ['DevOps'],
          mainContributions: ['CI/CD'],
          techStack: ['Docker'],
          leadershipSignals: ['Pipeline design'],
          confidence: 0.9,
        },
      ],
    };
    const result = profileAggregation.render(input);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('render includes all required sections', () => {
    const input = {
      username: 'testuser',
      repositoryAnalyses: [
        {
          repositoryName: 'repo1',
          summary: 'Test',
          projectType: 'web',
          estimatedRoles: [],
          mainContributions: [],
          techStack: [],
          leadershipSignals: [],
          confidence: 0.5,
        },
      ],
    };
    const rendered = profileAggregation.render(input);
    expect(rendered).toContain('overallSummary');
    expect(rendered).toContain('roleEstimation');
    expect(rendered).toContain('engineeringStrengths');
    expect(rendered).toContain('collaborationPatterns');
    expect(rendered).toContain('greenFlags');
    expect(rendered).toContain('redFlags');
    expect(rendered).toContain('recommended');
  });

  it('render includes anti-hallucination instructions', () => {
    const input = {
      username: 'testuser',
      repositoryAnalyses: [],
    };
    const rendered = profileAggregation.render(input);
    expect(rendered.toLowerCase()).toContain('hallucin');
    expect(rendered.toLowerCase()).toContain('fact');
    expect(rendered.toLowerCase()).toContain('evidence');
  });

  it('render includes synthesis instructions', () => {
    const input = {
      username: 'testuser',
      repositoryAnalyses: [
        {
          repositoryName: 'repo1',
          summary: 'Test repo',
          projectType: 'web-app',
          estimatedRoles: ['Backend'],
          mainContributions: ['Feature A'],
          techStack: ['Node.js'],
          leadershipSignals: [],
          confidence: 0.7,
        },
      ],
    };
    const rendered = profileAggregation.render(input);
    expect(rendered.toLowerCase()).toContain('synthes');
    expect(rendered.toLowerCase()).toContain('aggregat');
    expect(rendered).toContain('greenFlags');
    expect(rendered).toContain('redFlags');
  });

  it('render includes output JSON format specification', () => {
    const input = {
      username: 'testuser',
      repositoryAnalyses: [],
    };
    const rendered = profileAggregation.render(input);
    expect(rendered).toContain('{');
    expect(rendered).toContain('}');
    expect(rendered.toLowerCase()).toContain('json');
  });

  it('render handles multiple repository analyses', () => {
    const input = {
      username: 'multitest',
      repositoryAnalyses: [
        {
          repositoryName: 'repo1',
          summary: 'First',
          projectType: 'web',
          estimatedRoles: ['Frontend'],
          mainContributions: [],
          techStack: ['React'],
          leadershipSignals: [],
          confidence: 0.8,
        },
        {
          repositoryName: 'repo2',
          summary: 'Second',
          projectType: 'api',
          estimatedRoles: ['Backend'],
          mainContributions: [],
          techStack: ['Node.js'],
          leadershipSignals: [],
          confidence: 0.85,
        },
        {
          repositoryName: 'repo3',
          summary: 'Third',
          projectType: 'infra',
          estimatedRoles: ['DevOps', 'Technical Lead'],
          mainContributions: [],
          techStack: ['Docker', 'Kubernetes'],
          leadershipSignals: ['Architecture design'],
          confidence: 0.9,
        },
      ],
    };
    const result = profileAggregation.render(input);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('render includes Korean language instruction', () => {
    const input = {
      username: 'testuser',
      repositoryAnalyses: [],
    };
    const rendered = profileAggregation.render(input);
    expect(rendered).toContain('Korean');
    expect(rendered).toContain('overallSummary');
    expect(rendered).toContain('collaborationPatterns');
    expect(rendered).toContain('redFlags');
  });
});

describe('prompts/repository-analysis Korean instruction', () => {
  const repositoryAnalysis = require('../../prompts/repository-analysis').repositoryAnalysis;

  it('render includes Korean language instruction', () => {
    const input = { repositoryName: 'test' };
    const rendered = repositoryAnalysis.render(input);
    expect(rendered).toContain('Korean');
    expect(rendered).toContain('summary');
    expect(rendered).toContain('CRITICAL REVIEW');
  });
});
