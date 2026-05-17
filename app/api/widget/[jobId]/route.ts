import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import {
  WIDGET_SVG_VERSION,
  renderWidgetSvgVariants,
  type WidgetReport,
  type WidgetTheme,
} from '../../../../services/widget-export';

interface RouteParams {
  params: Promise<{ jobId: string }>;
}

function getGitHubUsername(githubProfile: string): string {
  try {
    return new URL(githubProfile).pathname.split('/').filter(Boolean)[0] || '';
  } catch {
    return githubProfile.split('/').filter(Boolean).pop() || '';
  }
}

export async function GET(request: Request, { params }: RouteParams) {
  const { jobId } = await params;
  const theme = getWidgetTheme(request.url);

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

  const storedSvg = theme === 'dark'
    ? job.profile_report.widget_svg_dark
    : job.profile_report.widget_svg_light;

  if (storedSvg?.includes(`data-widget-version="${WIDGET_SVG_VERSION}"`)) {
    return svgResponse(storedSvg);
  }

  const variants = renderWidgetSvgVariants({
    githubUsername: getGitHubUsername(job.github_profile),
    overallSummary: job.profile_report.overall_summary,
    roleEstimation: job.profile_report.role_estimation as unknown as WidgetReport['roleEstimation'],
    greenFlags: job.profile_report.green_flags || [],
    redFlags: job.profile_report.red_flags || [],
    repositories: (job.repositories || []).map((repository) => ({
      language: repository.primary_language || '',
    })),
  });

  await prisma.profile_reports.update({
    where: { analysis_job_id: jobId },
    data: {
      widget_svg_light: variants.light,
      widget_svg_dark: variants.dark,
      widget_svg_updated_at: new Date(),
    },
  });

  return svgResponse(theme === 'dark' ? variants.dark : variants.light);
}

function getWidgetTheme(url: string): WidgetTheme {
  const value = new URL(url).searchParams.get('theme');
  return value === 'dark' ? 'dark' : 'light';
}

function svgResponse(svg: string) {
  return new NextResponse(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
