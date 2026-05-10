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

function ReportContent({ report }: { report: ProfileReport }) {
  const repos = report.repositories || [];
  const [showAllStrengths, setShowAllStrengths] = useState(false);
  const engineeringStrengths = report.engineeringStrengths || [];
  const visibleEngineeringStrengths = showAllStrengths
    ? engineeringStrengths
    : engineeringStrengths.slice(0, 3);
  const hiddenEngineeringStrengthCount = engineeringStrengths.length - visibleEngineeringStrengths.length;

  return (
    <div className="flex flex-col gap-8">
      <SectionCard title="전체 요약">
        <p className="text-sm leading-relaxed text-[#414753]">{report.overallSummary}</p>
      </SectionCard>

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
        <a
          href={`/api/report/${jobId}/pdf`}
          className="inline-flex items-center gap-2 rounded-lg border border-[#c1c6d5] px-4 py-2 text-xs font-semibold uppercase tracking-[0.5px] text-[#414753] transition-colors hover:border-[#717785] hover:text-[#181c22]"
        >
          <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" />
          </svg>
          <span>PDF 다운로드</span>
        </a>
      </header>

      <main className="mx-auto flex w-full max-w-[800px] flex-col gap-8 px-6 py-8">
        <div className="mb-2 text-center">
          <h1 className="text-[32px] font-bold leading-10 text-[#181c22]">
            GitHub Profile Analysis Report
          </h1>
        </div>

        <ReportContent report={report} />
      </main>
    </div>
  );
}
