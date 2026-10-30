-- 운영 DB(pinnedsignal 스키마)의 현재 스키마. Prisma `migrate diff --from-empty`로 만들고 운영 DB의 information_schema와 대조했다.
-- 운영 DB에는 baseline-on-migrate로 이 파일을 건너뛰고, 빈 DB(로컬, Testcontainers)에서만 실행한다.

-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" TEXT NOT NULL,
    "github_profile" TEXT NOT NULL,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repositories" (
    "id" TEXT NOT NULL,
    "analysis_job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "description" TEXT,
    "primary_language" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "is_fork" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repositories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repository_analyses" (
    "id" TEXT NOT NULL,
    "repository_id" TEXT NOT NULL,
    "repository_name" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "project_type" TEXT NOT NULL,
    "estimated_roles" TEXT[],
    "main_contributions" TEXT[],
    "tech_stack" TEXT[],
    "leadership_signals" TEXT[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repository_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_reports" (
    "id" TEXT NOT NULL,
    "analysis_job_id" TEXT NOT NULL,
    "overall_summary" TEXT NOT NULL,
    "role_estimation" JSONB NOT NULL,
    "engineering_strengths" TEXT[],
    "collaboration_patterns" TEXT[],
    "green_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "red_flags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "widget_svg_light" TEXT,
    "widget_svg_dark" TEXT,
    "widget_svg_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "profile_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_exports" (
    "id" TEXT NOT NULL,
    "analysis_job_id" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdf_exports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repositories_analysis_job_id_idx" ON "repositories"("analysis_job_id");

-- CreateIndex
CREATE INDEX "repository_analyses_repository_id_idx" ON "repository_analyses"("repository_id");

-- CreateIndex
CREATE UNIQUE INDEX "profile_reports_analysis_job_id_key" ON "profile_reports"("analysis_job_id");

-- CreateIndex
CREATE INDEX "pdf_exports_analysis_job_id_idx" ON "pdf_exports"("analysis_job_id");

-- AddForeignKey
ALTER TABLE "repositories" ADD CONSTRAINT "repositories_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repository_analyses" ADD CONSTRAINT "repository_analyses_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "repositories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_reports" ADD CONSTRAINT "profile_reports_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdf_exports" ADD CONSTRAINT "pdf_exports_analysis_job_id_fkey" FOREIGN KEY ("analysis_job_id") REFERENCES "analysis_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
