'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface RoleEstimation {
  primary: string;
  secondary: string[];
  recommended: string[];
}

interface ProfileReport {
  overallSummary: string;
  techStack?: string[];
  mainContributionAreas?: string[];
  repositories?: Array<{
    name: string;
    description: string;
    language: string;
    stars: number;
  }>;
  roleEstimation: RoleEstimation;
  engineeringStrengths: string[];
  collaborationPatterns: string[];
  greenFlags: string[];
  redFlags: string[];
}

interface ReportClientProps {
  jobId: string;
  initialReport: ProfileReport | null;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl bg-[#f1f3fc] p-6">
      <h2 className="text-2xl font-semibold leading-8 text-[#181c22]">{title}</h2>
      {children}
    </section>
  );
}

function ListItem({ item }: { item: string }) {
  return (
    <li className="flex items-start gap-2 text-sm leading-5 text-[#414753]">
      <span className="mt-0.5 text-[#717785]">•</span>
      <span>{item}</span>
    </li>
  );
}

function Badge({ text, variant = 'default' }: { text: string; variant?: 'primary' | 'secondary' | 'default' }) {
  const variantClasses = {
    primary: 'bg-[#005ab4] text-white',
    secondary: 'bg-[#e0e2eb] text-[#414753]',
    default: 'bg-[#e0e2eb] text-[#414753]',
  };

  return (
    <span className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] ${variantClasses[variant]}`}>
      {text}
    </span>
  );
}

interface RepoItem {
  name: string;
  description: string;
  language: string;
  stars: number;
}

function RepositoryCard({ repo }: { repo: RepoItem }) {
  return (
    <article className="overflow-hidden rounded-lg border border-[#e0e2eb] bg-white p-4 transition-colors hover:border-[#005ab4]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex flex-col gap-1">
          <span className="truncate text-base font-semibold leading-6 text-[#181c22]">{repo.name}</span>
          {repo.language && (
            <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#414753]">
              {repo.language}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {repo.stars > 0 && (
            <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#717785]">★ {repo.stars}</span>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm leading-5 text-[#414753]">{repo.description || '설명이 없습니다'}</p>
    </article>
  );
}

function RoleSection({ roleEstimation }: { roleEstimation: RoleEstimation }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm leading-5 text-[#414753]">주요:</span>
        <Badge text={roleEstimation.primary} variant="primary" />
      </div>

      {roleEstimation.secondary.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm leading-5 text-[#414753]">보조:</span>
          {roleEstimation.secondary.map((role, index) => (
            <Badge key={index} text={role} variant="secondary" />
          ))}
        </div>
      )}

      {roleEstimation.recommended.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm leading-5 text-[#414753]">추천:</span>
          {roleEstimation.recommended.map((role, index) => (
            <Badge key={index} text={role} variant="default" />
          ))}
        </div>
      )}
    </div>
  );
}

function FlagList({ title, items, tone }: { title: string; items: string[]; tone: 'green' | 'red' }) {
  const toneClasses = tone === 'green'
    ? 'border-[#b9dcc7] bg-[#f0f8f3] text-[#245235]'
    : 'border-[#efc7c7] bg-[#fff4f4] text-[#6f2b2b]';
  const markerClass = tone === 'green' ? 'bg-[#2f8f46]' : 'bg-[#c84646]';

  return (
    <section className={`flex flex-col gap-4 rounded-xl border p-6 ${toneClasses}`}>
      <h2 className="text-xl font-semibold leading-7">{title}</h2>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex items-start gap-2 text-sm leading-5">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${markerClass}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-5 opacity-75">표시할 항목이 없습니다.</p>
      )}
    </section>
  );
}

function WidgetExportModal({ jobId, open, onClose }: { jobId: string; open: boolean; onClose: () => void }) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [widgetTheme, setWidgetTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (open) {
      setPreviewNonce(Date.now());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const widgetUrl = origin ? `${origin}/api/widget/${jobId}` : '';
  const themedWidgetUrl = widgetUrl ? `${widgetUrl}?theme=${widgetTheme}` : '';
  const previewUrl = themedWidgetUrl && previewNonce
    ? `${themedWidgetUrl}&preview=${previewNonce}`
    : themedWidgetUrl;
  const reportUrl = origin ? `${origin}/report/${jobId}` : '';
  const markdownCode = themedWidgetUrl && reportUrl
    ? `[![Pinned Signal profile widget](${themedWidgetUrl})](${reportUrl})`
    : '';

  async function copyMarkdownCode() {
    if (!markdownCode) return;
    try {
      await navigator.clipboard.writeText(markdownCode);
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = markdownCode;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-[960px] flex-col gap-4 overflow-auto rounded-2xl bg-[#f1f3fc] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold leading-8 text-[#181c22]">SVG 위젯 내보내기</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[#717785] transition-colors hover:bg-[#e0e2eb] hover:text-[#181c22]"
            aria-label="닫기"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="rounded-lg border border-[#d9deea] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold leading-6 text-[#181c22]">Detailed Card SVG</h3>
              <p className="mt-1 text-xs leading-5 text-[#414753]">
                GitHub README에 붙여 넣을 수 있는 SVG 이미지 위젯입니다.
              </p>
            </div>
            {widgetUrl && (
              <a
                href={themedWidgetUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-[#c1c6d5] px-3 py-1.5 text-xs font-semibold text-[#414753] transition-colors hover:border-[#717785] hover:text-[#181c22]"
              >
                새 창에서 보기
              </a>
            )}
          </div>
          <div className="mb-3 inline-flex rounded-lg border border-[#c1c6d5] bg-[#f9f9ff] p-1">
            {(['light', 'dark'] as const).map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => {
                  setWidgetTheme(theme);
                  setPreviewNonce(Date.now());
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  widgetTheme === theme
                    ? 'bg-[#005ab4] text-white'
                    : 'text-[#414753] hover:bg-[#e0e2eb] hover:text-[#181c22]'
                }`}
              >
                {theme === 'light' ? '라이트' : '다크'}
              </button>
            ))}
          </div>
          {widgetUrl && (
            <img
              src={previewUrl}
              alt="Pinned Signal profile widget preview"
              title="Pinned Signal profile widget preview"
              loading="lazy"
              className="h-auto w-full max-w-[920px] rounded-2xl bg-[#f9f9ff]"
            />
          )}
        </div>

        <div className="rounded-lg border border-[#d9deea] bg-[#181c22] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[#d9deea]">Markdown</span>
            <button
              type="button"
              onClick={copyMarkdownCode}
              className="rounded-md border border-[#717785] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-white focus:outline-none focus:ring-2 focus:ring-white"
            >
              {copied ? '복사됨' : '복사'}
            </button>
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#f9f9ff]">
            {markdownCode || 'Markdown 코드를 준비하는 중입니다...'}
          </pre>
        </div>
      </div>
    </div>
  );
}

function ReportContent({ report, jobId }: { report: ProfileReport; jobId: string }) {
  const repos = report.repositories || [];
  const [showAllStrengths, setShowAllStrengths] = useState(false);
  const engineeringStrengths = report.engineeringStrengths || [];
  const greenFlags = report.greenFlags || [];
  const redFlags = report.redFlags || [];
  const visibleEngineeringStrengths = showAllStrengths
    ? engineeringStrengths
    : engineeringStrengths.slice(0, 3);
  const hiddenEngineeringStrengthCount = engineeringStrengths.length - visibleEngineeringStrengths.length;

  return (
    <div className="flex flex-col gap-8">
      <SectionCard title="전체 요약">
        <p className="text-sm leading-relaxed text-[#414753]">{report.overallSummary}</p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FlagList title="Green Flags" items={greenFlags} tone="green" />
        <FlagList title="Red Flags" items={redFlags} tone="red" />
      </div>

      {report.techStack && report.techStack.length > 0 && (
        <SectionCard title="기술 스택 분석">
          <div className="flex flex-wrap gap-2">
            {report.techStack.map((tech, index) => (
              <span
                key={index}
                className="rounded-full bg-[#e0e2eb] px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] text-[#414753]"
              >
                {tech}
              </span>
            ))}
          </div>
        </SectionCard>
      )}

      {report.mainContributionAreas && report.mainContributionAreas.length > 0 && (
        <SectionCard title="주요 기여 분야">
          <ul className="space-y-2">
            {report.mainContributionAreas.map((area, index) => (
              <ListItem key={index} item={area} />
            ))}
          </ul>
        </SectionCard>
      )}

      {repos.length > 0 && (
        <SectionCard title="Pin된 저장소">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {repos.map((repo, index) => (
              <RepositoryCard key={index} repo={repo} />
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="예상 역할">
        <RoleSection roleEstimation={report.roleEstimation} />
      </SectionCard>

      {engineeringStrengths.length > 0 && (
        <SectionCard title="엔지니어링 강점">
          <ul className="space-y-2">
            {visibleEngineeringStrengths.map((strength, index) => (
              <ListItem key={index} item={strength} />
            ))}
          </ul>
          {engineeringStrengths.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllStrengths((current) => !current)}
              className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#c1c6d5] bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] text-[#414753] transition-colors hover:border-[#717785] hover:text-[#181c22] focus:outline-none focus:ring-2 focus:ring-[#005ab4] focus:ring-offset-2 focus:ring-offset-[#f1f3fc]"
              aria-expanded={showAllStrengths}
            >
              <span>{showAllStrengths ? '접기' : `${hiddenEngineeringStrengthCount}개 더 보기`}</span>
              <svg
                className={`h-[18px] w-[18px] transition-transform ${showAllStrengths ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </SectionCard>
      )}

      {report.collaborationPatterns && report.collaborationPatterns.length > 0 && (
        <SectionCard title="협업 패턴">
          <ul className="space-y-2">
            {report.collaborationPatterns.map((pattern, index) => (
              <ListItem key={index} item={pattern} />
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9ff]">
      <div className="relative">
        <div className="h-16 w-16 rounded-full border-2 border-[#e0e2eb]" />
        <div className="absolute left-0 top-0 h-16 w-16 animate-spin rounded-full border-2 border-transparent border-t-[#005ab4]" />
      </div>
      <p className="mt-6 text-sm leading-5 text-[#414753]">보고서 로딩 중...</p>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f9f9ff] px-4 text-center">
      <div className="mb-6 text-5xl text-[#ba1a1a]">!</div>
      <h2 className="mb-3 text-2xl font-semibold leading-8 text-[#181c22]">보고서 로딩 실패</h2>
      <p className="text-sm leading-5 text-[#414753]">{error}</p>
    </div>
  );
}

export default function ReportClient({ jobId, initialReport }: ReportClientProps) {
  const [report, setReport] = useState<ProfileReport | null>(initialReport);
  const [loading, setLoading] = useState(!initialReport);
  const [error, setError] = useState<string | null>(null);
  const [widgetModalOpen, setWidgetModalOpen] = useState(false);

  useEffect(() => {
    if (initialReport) return;

    async function fetchReport() {
      try {
        setLoading(true);
        const response = await fetch(`/api/report/${jobId}`);
        if (!response.ok) {
          throw new Error('보고서를 가져올 수 없습니다');
        }
        const data = await response.json();
        setReport(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다');
      } finally {
        setLoading(false);
      }
    }

    fetchReport();
  }, [jobId, initialReport]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!report) return <ErrorState error="보고서를 찾을 수 없습니다" />;

  return (
    <div className="min-h-screen bg-[#f9f9ff] text-[#181c22]">
      <header className="mx-auto flex w-full max-w-[1152px] items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-[#c1c6d5] px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] text-[#414753] transition-colors hover:border-[#717785] hover:text-[#181c22]"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>메인 화면으로</span>
        </Link>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setWidgetModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#c1c6d5] px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] text-[#414753] transition-colors hover:border-[#717785] hover:text-[#181c22]"
          >
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            <span>SVG 위젯 내보내기</span>
          </button>
          <a
            href={`/api/report/${jobId}/pdf`}
            className="inline-flex items-center gap-2 rounded-lg border border-[#c1c6d5] px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] text-[#414753] transition-colors hover:border-[#717785] hover:text-[#181c22]"
          >
            <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" />
            </svg>
            <span>PDF 다운로드</span>
          </a>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1280px] flex-col gap-8 px-6 py-8">
        <div className="mb-2 text-center">
          <h1 className="text-[32px] font-bold leading-10 text-[#181c22]">
            GitHub Profile Analysis Report
          </h1>
        </div>

        <ReportContent report={report} jobId={jobId} />
      </main>

      <WidgetExportModal jobId={jobId} open={widgetModalOpen} onClose={() => setWidgetModalOpen(false)} />
    </div>
  );
}
