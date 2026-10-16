import type { profile_reports, repositories } from '@prisma/client';
import { prisma } from '../../../lib/prisma';
import { ProfileReportSchema } from '../../../schemas/profile-report';
import ReportClient from './ReportClient';

interface RoleEstimation {
  primary: string;
  secondary: string[];
  recommended: string[];
}

interface ReportRepository {
  name: string;
  description: string;
  language: string;
  stars: number;
}

interface ProfileReport {
  overallSummary: string;
  repositories: ReportRepository[];
  roleEstimation: RoleEstimation;
  engineeringStrengths: string[];
  collaborationPatterns: string[];
  greenFlags: string[];
  redFlags: string[];
}

function normalizeReport(
  data: profile_reports,
  repositories: repositories[]
): ProfileReport {
  return {
    overallSummary: data.overall_summary,
    repositories: repositories.map((r) => ({
      name: r.name,
      description: r.description || '',
      language: r.primary_language || '',
      stars: r.stars,
    })),
    roleEstimation: ProfileReportSchema.shape.roleEstimation.parse(data.role_estimation),
    engineeringStrengths: data.engineering_strengths,
    collaborationPatterns: data.collaboration_patterns,
    greenFlags: data.green_flags,
    redFlags: data.red_flags,
  };
}

interface PageProps {
  params: Promise<{ jobId: string }>;
}

async function getReport(jobId: string) {
  const job = await prisma.analysis_jobs.findUnique({
    where: { id: jobId },
    include: {
      profile_report: true,
      repositories: true,
    },
  });

  if (!job?.profile_report || job.status !== 'COMPLETED') return null;
  return normalizeReport(job.profile_report, job.repositories);
}

export default async function ReportPage({ params }: PageProps) {
  const { jobId } = await params;
  const initialReport = await getReport(jobId);

  return <ReportClient jobId={jobId} initialReport={initialReport} />;
}
