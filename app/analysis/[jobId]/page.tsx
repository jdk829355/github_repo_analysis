"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";

type JobState = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

interface RepoAnalysis {
  repo: string;
  summary?: string;
}

interface AnalysisEvent {
  type: string;
  state?: JobState;
  jobId?: string;
  repo?: string;
  error?: string;
  totalRepos?: number;
  repos?: string[];
  summary?: string;
}

type AnalysisParams = { jobId: string } | Promise<{ jobId: string }>;

export default function AnalysisProgressPage({
  params,
}: {
  params: AnalysisParams;
}) {
  return <AnalysisProgressClient params={params} />;
}

function AnalysisProgressClient({
  params,
}: {
  params: AnalysisParams;
}) {
  const router = useRouter();
  const initialJobId = "then" in params ? null : params.jobId;
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [status, setStatus] = useState<JobState>("PENDING");
  const [currentRepo, setCurrentRepo] = useState<string | null>(null);
  const [totalRepos, setTotalRepos] = useState<number>(0);
  const [completedRepos, setCompletedRepos] = useState<RepoAnalysis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasNavigated = useRef(false);

  const navigateToReport = useCallback((targetJobId: string) => {
    if (hasNavigated.current) return;
    hasNavigated.current = true;
    eventSourceRef.current?.close();
    router.push(`/report/${targetJobId}`);
  }, [router]);

  useEffect(() => {
    if (!("then" in params)) return;
    params.then((p) => setJobId(p.jobId));
  }, [params]);

  useEffect(() => {
    if (!jobId) return;

    const connect = () => {
      if (hasNavigated.current) return;

      const eventSource = new EventSource(`/api/analysis/${jobId}/events`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data: AnalysisEvent = JSON.parse(event.data);

          switch (data.type) {
            case "state":
            case "stateChange":
              if (data.state) {
                setStatus(data.state);
                if (data.state === "COMPLETED") {
                  navigateToReport(jobId);
                }
              }
              break;

            case "repo_list":
              if (data.totalRepos) {
                setTotalRepos(data.totalRepos);
              }
              break;

            case "repo_analysis_completed":
              if (data.repo) {
                setCurrentRepo(data.repo);
                setCompletedRepos((prev) => [
                  ...prev,
                  { repo: data.repo!, summary: data.summary || "" },
                ]);
              }
              break;

            case "repo_analysis_failed":
              if (data.repo) {
                setCompletedRepos((prev) => [
                  ...prev,
                  { repo: data.repo!, summary: `실패: ${data.error || "알 수 없는 오류"}` },
                ]);
              }
              break;

            case "aggregation_complete":
              setStatus("COMPLETED");
              navigateToReport(jobId);
              break;

            case "job_complete":
              navigateToReport(jobId);
              break;

            case "job_failed":
              setStatus("FAILED");
              setError(data.error || "Analysis job failed");
              eventSource.close();
              break;
          }
        } catch {
          // Ignore parse errors for heartbeat messages
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (!hasNavigated.current && status !== "COMPLETED" && status !== "FAILED") {
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, 2000);
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [jobId, navigateToReport, status]);

  const handleRetry = () => {
    setError(null);
    setStatus("PENDING");
    setCompletedRepos([]);
    setCurrentRepo(null);
    hasNavigated.current = false;
    if (jobId) {
      const eventSource = new EventSource(`/api/analysis/${jobId}/events`);
      eventSourceRef.current = eventSource;
    }
  };

  const progressPercent = totalRepos > 0 ? (completedRepos.length / totalRepos) * 100 : 0;
  const pendingCount = Math.max(totalRepos - completedRepos.length - (status === "PROCESSING" ? 1 : 0), 0);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f9f9ff] p-4 text-[#181c22] sm:p-6 md:p-8">
      <div className="w-full max-w-[600px]">
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-[32px] font-bold leading-10 tracking-tight text-[#181c22]">
            저장소 분석 중...
          </h1>
          <p className="text-base leading-6 text-[#414753]">
            {jobId ? "연결된 저장소에서 인사이트를 수집하고 있습니다." : "분석 작업을 불러오는 중입니다."}
          </p>
        </div>

        {status === "FAILED" && error ? (
          <div className="space-y-5 rounded-xl border border-[#c1c6d5] bg-white p-8 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#ffdad6]">
              <svg
                className="h-8 w-8 text-[#ba1a1a]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-semibold leading-8 text-[#181c22]">분석 실패</h2>
              <p className="mt-2 text-sm leading-5 text-[#414753]">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="mt-2 rounded-lg bg-[#005ab4] px-6 py-3 text-xs font-semibold uppercase tracking-[0.5px] text-white transition-colors hover:bg-[#0a73e0]"
            >
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <div className="mb-2 flex items-end justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#414753]">Progress</span>
                <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#414753]">
                  {completedRepos.length} / {totalRepos || "?"}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[#e0e2eb]">
                <div
                  className="h-full rounded-full bg-[#005ab4] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-[#c1c6d5] bg-white shadow-sm">
              <ul className="flex flex-col divide-y divide-[#c1c6d5]">
                {completedRepos.map((repo, index) => {
                  const failed = repo.summary?.startsWith("Failed:") || repo.summary?.startsWith("실패:");
                  return (
                    <li
                      key={`${repo.repo}-${index}`}
                      className="flex items-center gap-4 bg-[#f1f3fc]/50 p-4"
                    >
                      <span className={failed ? "text-[#ba1a1a]" : "text-[#005ab4]"}>
                        {failed ? "!" : "✓"}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm leading-5 text-[#181c22]">{repo.repo}</span>
                      <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#717785]">
                        {failed ? "Failed" : "Complete"}
                      </span>
                    </li>
                  );
                })}
                {status === "PROCESSING" && (
                  <li className="flex items-center gap-4 p-4">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#c1c6d5] border-t-[#005ab4]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium leading-5 text-[#181c22]">
                      {currentRepo || "분석 시작 중..."}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#005ab4]">Analyzing</span>
                  </li>
                )}
                {status === "PENDING" && completedRepos.length === 0 && (
                  <li className="flex items-center gap-4 p-4">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#c1c6d5] border-t-[#005ab4]" />
                    <span className="flex-1 text-sm leading-5 text-[#181c22]">시작 대기 중...</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#717785]">Pending</span>
                  </li>
                )}
                {Array.from({ length: pendingCount }).slice(0, 6).map((_, index) => (
                  <li key={`pending-${index}`} className="flex items-center gap-4 p-4 opacity-60">
                    <span className="text-[#c1c6d5]">○</span>
                    <span className="flex-1 text-sm leading-5 text-[#414753]">대기 중인 저장소</span>
                    <span className="text-xs font-semibold uppercase tracking-[0.5px] text-[#c1c6d5]">Pending</span>
                  </li>
                ))}
              </ul>
              {status === "COMPLETED" && (
                <div className="border-t border-[#c1c6d5] bg-[#f1f3fc] p-4 text-center text-sm font-medium text-[#181c22]">
                  분석 완료! 보고서로 이동합니다.
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
