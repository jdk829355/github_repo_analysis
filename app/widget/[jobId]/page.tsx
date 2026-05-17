import { PrismaClient } from '@prisma/client';

interface RoleEstimation {
  primary: string;
  secondary: string[];
  recommended: string[];
}

interface WidgetReport {
  overallSummary: string;
  roleEstimation: RoleEstimation;
  greenFlags: string[];
  redFlags: string[];
  repositories: Array<{
    language: string;
  }>;
}

interface PageProps {
  params: Promise<{ jobId: string }>;
}

function getTopTechStack(report: WidgetReport): string[] {
  const repoLanguages = report.repositories.map((repo) => repo.language).filter(Boolean);
  return Array.from(new Set(repoLanguages)).slice(0, 4);
}

async function getWidgetReport(jobId: string): Promise<WidgetReport | null> {
  const prisma = new PrismaClient();

  const job = await prisma.analysis_jobs.findUnique({
    where: { id: jobId },
    include: {
      profile_report: true,
      repositories: true,
    },
  });

  if (!job?.profile_report) return null;

  return {
    overallSummary: job.profile_report.overall_summary,
    roleEstimation: job.profile_report.role_estimation as unknown as RoleEstimation,
    greenFlags: job.profile_report.green_flags || [],
    redFlags: job.profile_report.red_flags || [],
    repositories: (job.repositories || []).map((repository) => ({
      language: repository.primary_language || '',
    })),
  };
}

function FlagList({ title, items, tone }: { title: string; items: string[]; tone: 'green' | 'red' }) {
  const toneClasses = tone === 'green'
    ? 'border-[#b9dcc7] bg-[#f0f8f3] text-[#245235]'
    : 'border-[#efc7c7] bg-[#fff4f4] text-[#6f2b2b]';
  const markerClass = tone === 'green' ? 'bg-[#2f8f46]' : 'bg-[#c84646]';
  const fallback = tone === 'green'
    ? '긍정 신호가 아직 충분히 도출되지 않았습니다.'
    : '비판적 보완 신호가 아직 충분히 도출되지 않았습니다.';

  return (
    <section className={`rounded-lg border p-5 ${toneClasses}`}>
      <h2 className="text-xl font-bold leading-7">{title}</h2>
      <ul className="mt-4 space-y-3">
        {(items.length > 0 ? items : [fallback]).slice(0, 3).map((item, index) => (
          <li key={index} className="flex items-start gap-3 text-sm leading-5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${markerClass}`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function WidgetPage({ params }: PageProps) {
  const { jobId } = await params;
  const report = await getWidgetReport(jobId);

  if (!report) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f9f9ff] p-6 text-[#181c22]">
        <section className="rounded-xl border border-[#d9deea] bg-white p-6 text-center">
          <h1 className="text-xl font-bold">Pinned Signal</h1>
          <p className="mt-2 text-sm text-[#414753]">위젯을 찾을 수 없습니다.</p>
        </section>
      </main>
    );
  }

  const primaryRole = report.roleEstimation.primary || 'Developer';
  const techStack = getTopTechStack(report);

  return (
    <main className="bg-[#f9f9ff] p-4 text-[#181c22]">
      <article className="mx-auto max-w-[920px] overflow-hidden rounded-2xl border border-[#d9deea] bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-[#005ab4]">Pinned Signal</div>
            <h1 className="mt-3 text-3xl font-extrabold leading-10">{primaryRole} Profile</h1>
          </div>
          <span className="rounded-full bg-[#005ab4] px-4 py-2 text-xs font-bold text-white">
            {report.repositories.length} pinned repos
          </span>
        </div>

        <p className="mt-5 max-w-[760px] text-sm font-medium leading-6 text-[#414753]">
          {report.overallSummary}
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-[#005ab4] px-5 py-2 text-sm font-bold text-white">{primaryRole}</span>
          {techStack.length > 0 && (
            <span className="text-sm font-semibold text-[#717785]">{techStack.join(' · ')}</span>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          <FlagList title="Green Flags" items={report.greenFlags} tone="green" />
          <FlagList title="Growth Areas" items={report.redFlags} tone="red" />
        </div>
      </article>
    </main>
  );
}
