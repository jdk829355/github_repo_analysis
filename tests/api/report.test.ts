const mockAnalysisJobsFindUnique = jest.fn();
const mockPdfExportsCreate = jest.fn();
const mockPdfExportsUpdate = jest.fn();

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => ({
    analysis_jobs: {
      findUnique: mockAnalysisJobsFindUnique,
    },
    pdf_exports: {
      create: mockPdfExportsCreate,
      update: mockPdfExportsUpdate,
    },
  })),
}));

const mockGenerateReportPdf = jest.fn();

jest.mock('../../services/pdf-export', () => ({
  generateReportPdf: mockGenerateReportPdf,
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
}));

import { GET as getReport } from '../../app/api/report/[jobId]/route';
import { GET as getPdf } from '../../app/api/report/[jobId]/pdf/route';
import fs from 'fs';

describe('GET /api/report/[jobId]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when job is not found', async () => {
    mockAnalysisJobsFindUnique.mockResolvedValue(null);

    const request = new Request('http://localhost/api/report/nonexistent');
    const response = await getReport(request as any, {
      params: Promise.resolve({ jobId: 'nonexistent' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns 404 when job exists but has no profile report', async () => {
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'job-123',
      status: 'PROCESSING',
      profile_report: null,
    });

    const request = new Request('http://localhost/api/report/job-123');
    const response = await getReport(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns profile report when found', async () => {
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'job-123',
      status: 'COMPLETED',
      profile_report: {
        overall_summary: 'Test summary',
        role_estimation: { primary: 'Backend', secondary: [], recommended: [] },
        engineering_strengths: ['API design'],
        collaboration_patterns: ['Code reviews'],
        green_flags: ['API design evidence'],
        red_flags: ['Limited testing evidence'],
      },
      repositories: [
        { name: 'repo-1', description: 'Test repo', primary_language: 'TypeScript', stars: 10 },
      ],
    });

    const request = new Request('http://localhost/api/report/job-123');
    const response = await getReport(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      overallSummary: 'Test summary',
      roleEstimation: { primary: 'Backend', secondary: [], recommended: [] },
      engineeringStrengths: ['API design'],
      collaborationPatterns: ['Code reviews'],
      greenFlags: ['API design evidence'],
      redFlags: ['Limited testing evidence'],
      repositories: [
        { name: 'repo-1', description: 'Test repo', language: 'TypeScript', stars: 10 },
      ],
    });
  });

  it('returns 404 when job is not found', async () => {
    mockAnalysisJobsFindUnique.mockResolvedValue(null);

    const request = new Request('http://localhost/api/report/nonexistent/pdf');
    const response = await getPdf(request as any, {
      params: Promise.resolve({ jobId: 'nonexistent' }),
    });
    expect(response.status).toBe(404);
  });

  it('returns 404 when job has no profile report', async () => {
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'job-123',
      status: 'PROCESSING',
      profile_report: null,
    });

    const request = new Request('http://localhost/api/report/job-123/pdf');
    const response = await getPdf(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });
    expect(response.status).toBe(404);
  });

  it('regenerates and returns PDF when an export record already exists', async () => {
    const pdfPath = '/tmp/pdfs/job-123.pdf';
    const pdfBuffer = Buffer.from('updated-pdf');
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'job-123',
      status: 'COMPLETED',
      profile_report: {
        id: 'report-123',
        overall_summary: 'Test summary',
        role_estimation: { primary: 'Backend', secondary: [], recommended: [] },
        engineering_strengths: ['API design'],
        collaboration_patterns: ['Code reviews'],
        green_flags: ['API design evidence'],
        red_flags: ['Limited testing evidence'],
      },
      repositories: [
        { name: 'repo-1', description: 'Test repo', primary_language: 'TypeScript', stars: 10 },
      ],
      pdf_exports: [{ id: 'export-123', file_path: '/tmp/pdfs/job-123.pdf' }],
    });
    mockGenerateReportPdf.mockResolvedValue(pdfPath);
    (fs.readFileSync as jest.Mock).mockReturnValue(pdfBuffer);

    const request = new Request('http://localhost/api/report/job-123/pdf');
    const response = await getPdf(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(mockGenerateReportPdf).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({
        overallSummary: 'Test summary',
        greenFlags: ['API design evidence'],
        redFlags: ['Limited testing evidence'],
        repositories: [
          { name: 'repo-1', description: 'Test repo', language: 'TypeScript', stars: 10 },
        ],
      })
    );
    expect(mockPdfExportsUpdate).toHaveBeenCalledWith({
      where: { id: 'export-123' },
      data: { file_path: pdfPath },
    });
    const buffer = await response.arrayBuffer();
    expect(Buffer.from(buffer)).toEqual(pdfBuffer);
  });

  it('generates and returns new PDF when none exists', async () => {
    const pdfPath = '/tmp/pdfs/job-123.pdf';
    const pdfBuffer = Buffer.from('new-pdf');
    mockAnalysisJobsFindUnique.mockResolvedValue({
      id: 'job-123',
      status: 'COMPLETED',
      profile_report: {
        id: 'report-123',
        overall_summary: 'Test',
        role_estimation: { primary: 'Backend', secondary: [], recommended: [] },
        engineering_strengths: ['API design'],
        collaboration_patterns: ['Code reviews'],
        green_flags: ['API design evidence'],
        red_flags: ['Limited testing evidence'],
      },
      repositories: [],
      pdf_exports: [],
    });
    mockGenerateReportPdf.mockResolvedValue(pdfPath);
    (fs.readFileSync as jest.Mock).mockReturnValue(pdfBuffer);

    const request = new Request('http://localhost/api/report/job-123/pdf');
    const response = await getPdf(request as any, {
      params: Promise.resolve({ jobId: 'job-123' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/pdf');
    expect(mockGenerateReportPdf).toHaveBeenCalledWith(
      'job-123',
      expect.objectContaining({
        overallSummary: 'Test',
        greenFlags: ['API design evidence'],
        redFlags: ['Limited testing evidence'],
        repositories: [],
      })
    );
    expect(mockPdfExportsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          analysis_job_id: 'job-123',
        }),
      })
    );
    const buffer = await response.arrayBuffer();
    expect(Buffer.from(buffer)).toEqual(pdfBuffer);
  });
});
