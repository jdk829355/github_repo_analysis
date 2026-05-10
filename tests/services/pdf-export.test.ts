const mockPdf = jest.fn();
const mockSetContent = jest.fn();
const mockNewPage = jest.fn(() => ({
  setContent: mockSetContent,
  pdf: mockPdf,
}));
const mockClose = jest.fn();
const mockLaunch = jest.fn<Promise<{ newPage: jest.Mock; close: jest.Mock }>, []>(() =>
  Promise.resolve({
    newPage: mockNewPage,
    close: mockClose,
  })
);

jest.mock(
  'playwright',
  () => ({
    chromium: {
      launch: mockLaunch,
    },
  }),
  { virtual: true }
);

jest.mock('fs', () => ({
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('os', () => ({
  tmpdir: jest.fn(() => '/tmp'),
}));

jest.mock('../../lib/config', () => ({
  getAppUrl: jest.fn(() => 'http://localhost:3000'),
}));

describe('services/pdf-export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.PDF_EXPORT_DIR;
  });

  describe('generateReportPdf', () => {
    const report = {
      overallSummary: '한글 요약',
      roleEstimation: {
        primary: 'Backend',
        secondary: ['Frontend'],
        recommended: ['Full Stack Developer'],
      },
      engineeringStrengths: ['API 설계'],
      collaborationPatterns: ['문서화'],
      repositories: [
        {
          name: 'repo-a',
          description: '저장소 설명',
          language: 'TypeScript',
          stars: 3,
        },
      ],
    };

    it('should launch browser, render print HTML, and generate PDF', async () => {
      const { generateReportPdf } = await import('../../services/pdf-export');

      await generateReportPdf('job-123', report);

      expect(mockLaunch).toHaveBeenCalledWith({ headless: true, executablePath: undefined });
      expect(mockNewPage).toHaveBeenCalled();
      expect(mockSetContent).toHaveBeenCalledWith(
        expect.stringContaining('저장소 설명'),
        { waitUntil: 'load' }
      );
      const renderedHtml = mockSetContent.mock.calls[0][0];
      expect(renderedHtml).toContain('<section class="section">');
      expect(renderedHtml).toContain('<p class="summary-text">한글 요약</p>');
      expect(renderedHtml).toContain('<ul class="repo-list">');
      expect(renderedHtml).toContain('<strong>repo-a</strong>');
      expect(renderedHtml).toContain('<ul class="definition-list">');
      expect(mockPdf).toHaveBeenCalledWith({
        path: expect.stringContaining('job-123.pdf'),
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      expect(mockClose).toHaveBeenCalled();
    });

    it('should return the correct PDF file path', async () => {
      const { generateReportPdf } = await import('../../services/pdf-export');

      const result = await generateReportPdf('job-456', report);

      expect(result).toMatch(/job-456\.pdf$/);
      expect(result).toContain('/tmp/neutral-news/pdfs');
    });

    it('should allow overriding the PDF output directory', async () => {
      process.env.PDF_EXPORT_DIR = '/custom/pdfs';
      const { generateReportPdf } = await import('../../services/pdf-export');

      const result = await generateReportPdf('job-env', report);

      expect(result).toBe('/custom/pdfs/job-env.pdf');
      delete process.env.PDF_EXPORT_DIR;
    });

    it('should handle browser launch errors', async () => {
      const error = new Error('Browser launch failed');
      mockLaunch.mockRejectedValueOnce(error);

      const { generateReportPdf } = await import('../../services/pdf-export');

      await expect(generateReportPdf('job-789', report)).rejects.toThrow('Browser launch failed');
      expect(mockClose).not.toHaveBeenCalled();
    });

    it('should handle print HTML rendering errors', async () => {
      const error = new Error('Render failed');
      mockSetContent.mockRejectedValueOnce(error);

      const { generateReportPdf } = await import('../../services/pdf-export');

      await expect(generateReportPdf('job-abc', report)).rejects.toThrow('Render failed');
      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle PDF generation errors', async () => {
      const error = new Error('PDF generation failed');
      mockPdf.mockRejectedValueOnce(error);

      const { generateReportPdf } = await import('../../services/pdf-export');

      await expect(generateReportPdf('job-def', report)).rejects.toThrow('PDF generation failed');
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
