import { PrismaClient } from '@prisma/client';
import ReportClient from './ReportClient';

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

interface PrismaProfileReport {
  overall_summary: string;
  tech_stack?: string[];
  main_contribution_areas?: string[];
  repositories?: Array<{
    name: string;
    description: string;
    primary_language: string;
    stars: number;
  }>;
  role_estimation: RoleEstimation;
  engineering_strengths: string[];
  collaboration_patterns: string[];
  green_flags?: string[];
  red_flags?: string[];
}

function normalizeReport(data: PrismaProfileReport): ProfileReport {
  return {
    overallSummary: data.overall_summary,
    techStack: data.tech_stack,
    mainContributionAreas: data.main_contribution_areas,
    repositories: (data.repositories || []).map((r) => ({
      name: r.name,
      description: r.description || '',
      language: r.primary_language || '',
      stars: r.stars,
    })),
    roleEstimation: data.role_estimation,
    engineeringStrengths: data.engineering_strengths,
    collaborationPatterns: data.collaboration_patterns,
    greenFlags: data.green_flags || [],
    redFlags: data.red_flags || [],
  };
}

interface PageProps {
  params: Promise<{ jobId: string }>;
}

async function getReport(jobId: string) {
  const prisma = new PrismaClient();

  const job = await prisma.analysis_jobs.findUnique({
    where: { id: jobId },
    include: {
      profile_report: true,
      repositories: true,
    },
  });

  if (!job?.profile_report) return null;
  const report = normalizeReport(job.profile_report as unknown as PrismaProfileReport);
  report.repositories = (job.repositories || []).map((r: any) => ({
    name: r.name,
    description: r.description || '',
    language: r.primary_language || '',
    stars: r.stars,
  }));
  return report;
}

export default async function ReportPage({ params }: PageProps) {
  const { jobId } = await params;
  const initialReport = await getReport(jobId);

  return <ReportClient jobId={jobId} initialReport={initialReport} />;
}
