import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { renderWidgetSvg, type WidgetReport } from '../../../../services/widget-export';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  void request;
  const { jobId } = await params;

  const job = await prisma.analysis_jobs.findUnique({
    where: { id: jobId },
    include: {
      profile_report: true,
      repositories: true,
    },
  });

  if (!job?.profile_report) {
    return new NextResponse('Widget not found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const report: WidgetReport = {
    overallSummary: job.profile_report.overall_summary,
    roleEstimation: job.profile_report.role_estimation as unknown as WidgetReport['roleEstimation'],
    greenFlags: job.profile_report.green_flags || [],
    redFlags: job.profile_report.red_flags || [],
    repositories: (job.repositories || []).map((repository) => ({
      language: repository.primary_language || '',
    })),
  };

  return new NextResponse(renderWidgetSvg(report), {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
