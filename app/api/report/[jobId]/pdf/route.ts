import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { generateReportPdf, type PdfReport } from '../../../../../services/pdf-export';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;

  const job = await prisma.analysis_jobs.findUnique({
    where: { id: jobId },
    include: {
      profile_report: true,
      pdf_exports: true,
      repositories: true,
    },
  });

  if (!job || !job.profile_report) {
    return NextResponse.json(
      { error: 'Report not found' },
      { status: 404 }
    );
  }

  const report: PdfReport = {
    overallSummary: job.profile_report.overall_summary,
    roleEstimation: job.profile_report.role_estimation as PdfReport['roleEstimation'],
    engineeringStrengths: job.profile_report.engineering_strengths,
    collaborationPatterns: job.profile_report.collaboration_patterns,
    greenFlags: job.profile_report.green_flags || [],
    redFlags: job.profile_report.red_flags || [],
    repositories: (job.repositories || []).map((repository) => ({
      name: repository.name,
      description: repository.description || '',
      language: repository.primary_language || '',
      stars: repository.stars,
    })),
  };

  const pdfPath = await generateReportPdf(jobId, report);

  if (job.pdf_exports.length > 0) {
    await prisma.pdf_exports.update({
      where: { id: job.pdf_exports[0].id },
      data: { file_path: pdfPath },
    });
  } else {
    await prisma.pdf_exports.create({
      data: {
        analysis_job_id: jobId,
        file_path: pdfPath,
      },
    });
  }

  const fs = await import('fs');
  const buffer = fs.readFileSync(pdfPath);
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  return new NextResponse(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-${jobId}.pdf"`,
    },
  });
}
