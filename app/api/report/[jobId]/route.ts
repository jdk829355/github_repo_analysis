import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = await prisma.analysis_jobs.findUnique({
    where: { id: jobId },
    include: {
      profile_report: true,
      repositories: true,
    },
  });

  if (!job || !job.profile_report) {
    return NextResponse.json(
      { error: 'Report not found' },
      { status: 404 }
    );
  }

  const report = job.profile_report;
  return NextResponse.json({
    overallSummary: report.overall_summary,
    roleEstimation: report.role_estimation,
    engineeringStrengths: report.engineering_strengths,
    collaborationPatterns: report.collaboration_patterns,
    greenFlags: report.green_flags || [],
    redFlags: report.red_flags || [],
    repositories: (job.repositories || []).map((r: any) => ({
      name: r.name,
      description: r.description || '',
      language: r.primary_language || '',
      stars: r.stars,
    })),
  }, { status: 200 });
}
