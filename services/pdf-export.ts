import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

function getPdfDir(): string {
  return process.env.PDF_EXPORT_DIR || join(tmpdir(), 'neutral-news', 'pdfs');
}

export interface PdfRepository {
  name: string;
  description: string;
  language: string;
  stars: number;
}

export interface PdfReport {
  overallSummary: string;
  roleEstimation: {
    primary: string;
    secondary: string[];
    recommended: string[];
  };
  engineeringStrengths: string[];
  collaborationPatterns: string[];
  greenFlags: string[];
  redFlags: string[];
  repositories: PdfRepository[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderList(items: string[]): string {
  if (items.length === 0) {
    return '<p class="muted">표시할 항목이 없습니다.</p>';
  }

  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderDefinitionList(items: Array<{ label: string; value: string }>): string {
  const visibleItems = items.filter((item) => item.value.trim().length > 0);

  if (visibleItems.length === 0) {
    return '<p class="muted">표시할 항목이 없습니다.</p>';
  }

  return `<ul class="definition-list">${visibleItems
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.value)}</span></li>`
    )
    .join('')}</ul>`;
}

function renderReportHtml(report: PdfReport): string {
  const repositories = report.repositories.length > 0
    ? report.repositories
        .map((repo) => `
          <li>
            <strong>${escapeHtml(repo.name)}</strong>
            <span>${escapeHtml(repo.language || '언어 정보 없음')}${repo.stars > 0 ? ` · ★ ${repo.stars}` : ''}</span>
            <p>${escapeHtml(repo.description || '설명이 없습니다.')}</p>
          </li>
        `)
        .join('')
    : '<p class="muted">표시할 저장소가 없습니다.</p>';

  const roleItems = [
    { label: '주요 역할', value: report.roleEstimation.primary },
    {
      label: '보조 역할',
      value: report.roleEstimation.secondary.join(', '),
    },
    {
      label: '추천 역할',
      value: report.roleEstimation.recommended.join(', '),
    },
  ];

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>GitHub Profile Analysis Report</title>
    <style>
      @page {
        size: A4;
        margin: 16mm 14mm;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #181c22;
        background: #ffffff;
        font-family: "Noto Sans CJK KR", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", Arial, sans-serif;
        font-size: 11pt;
        line-height: 1.55;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      h1, h2, h3, p {
        margin: 0;
      }

      h1 {
        font-size: 24pt;
        line-height: 1.2;
        letter-spacing: 0;
      }

      h2 {
        margin-bottom: 10pt;
        font-size: 15pt;
        line-height: 1.3;
      }

      h3 {
        font-size: 12pt;
        line-height: 1.35;
      }

      ul {
        margin: 0;
        padding-left: 16pt;
      }

      li + li {
        margin-top: 5pt;
      }

      .cover {
        margin-bottom: 18pt;
        padding-bottom: 12pt;
        border-bottom: 2pt solid #005ab4;
      }

      .eyebrow {
        margin-bottom: 6pt;
        color: #005ab4;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .subtitle {
        margin-top: 8pt;
        color: #414753;
      }

      .section {
        margin-bottom: 18pt;
        padding-top: 10pt;
        border-top: 1pt solid #d7ddea;
      }

      .section-title {
        margin-bottom: 8pt;
        break-after: avoid;
        page-break-after: avoid;
      }

      .summary-text {
        white-space: pre-wrap;
      }

      .definition-list,
      .repo-list {
        margin: 0;
        padding-left: 18pt;
      }

      .definition-list li,
      .repo-list li {
        break-inside: auto;
        page-break-inside: auto;
      }

      .definition-list li strong,
      .repo-list li strong {
        display: inline-block;
        margin-right: 6pt;
        color: #181c22;
      }

      .definition-list li span,
      .repo-list li span {
        color: #717785;
        font-size: 9pt;
      }

      .repo-list li p {
        margin-top: 4pt;
        color: #414753;
        font-size: 10pt;
      }

      .muted {
        color: #717785;
      }
    </style>
  </head>
  <body>
    <header class="cover">
      <p class="eyebrow">GitHub Profile Analysis</p>
      <h1>GitHub Profile Analysis Report</h1>
      <p class="subtitle">GitHub 프로필 분석 결과입니다. PDF 인쇄에 맞게 저장소 설명과 주요 분석 항목을 펼쳐서 표시합니다.</p>
    </header>

    <section class="section">
      <h2 class="section-title">전체 요약</h2>
      <p class="summary-text">${escapeHtml(report.overallSummary)}</p>
    </section>

    <section class="section">
      <h2 class="section-title">Green Flags</h2>
      ${renderList(report.greenFlags)}
    </section>

    <section class="section">
      <h2 class="section-title">Red Flags</h2>
      ${renderList(report.redFlags)}
    </section>

    <section class="section">
      <h2 class="section-title">Pin된 저장소</h2>
      ${report.repositories.length > 0 ? `<ul class="repo-list">${repositories}</ul>` : repositories}
    </section>

    <section class="section">
      <h2 class="section-title">예상 역할</h2>
      ${renderDefinitionList(roleItems)}
    </section>

    <section class="section">
      <h2 class="section-title">엔지니어링 강점</h2>
      ${renderList(report.engineeringStrengths)}
    </section>

    <section class="section">
      <h2 class="section-title">협업 패턴</h2>
      ${renderList(report.collaborationPatterns)}
    </section>
  </body>
</html>`;
}

export async function generateReportPdf(jobId: string, report: PdfReport): Promise<string> {
  const pdfDir = getPdfDir();
  const pdfPath = join(pdfDir, `${jobId}.pdf`);

  mkdirSync(pdfDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(renderReportHtml(report), { waitUntil: 'load' });

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });

    return pdfPath;
  } finally {
    await browser.close();
  }
}
