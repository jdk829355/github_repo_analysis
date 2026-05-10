"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VERIFICATION_REPO_URL } from "../lib/constants";

type VerificationStep = "idle" | "confirm";

export default function UrlInput() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<VerificationStep>("idle");
  const [pendingUsername, setPendingUsername] = useState("");
  const router = useRouter();

  const extractUsername = (url: string): string | null => {
    try {
      let cleanUrl = url.trim();
      if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
        cleanUrl = "https://" + cleanUrl;
      }
      const parsedUrl = new URL(cleanUrl);
      if (parsedUrl.hostname !== "github.com" && parsedUrl.hostname !== "www.github.com") {
        return null;
      }
      const parts = parsedUrl.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;
      return parts[0];
    } catch {
      return null;
    }
  };

  const validateUrl = () => {
    setError("");

    if (!url.trim()) {
      setError("GitHub 프로필 URL을 입력해주세요");
      return null;
    }

    const username = extractUsername(url);
    if (!username) {
      setError("올바른 GitHub 프로필 URL을 입력해주세요");
      return null;
    }

    return username;
  };

  const startAnalysis = async () => {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "분석 시작에 실패했습니다");
    }

    router.push(`/analysis/${data.jobId}`);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const username = validateUrl();
    if (!username) return;

    setPendingUsername(username);
    setStep("confirm");
  };

  const handleVerifyAndAnalyze = async () => {
    const username = validateUrl();
    if (!username) return;

    setPendingUsername(username);
    setIsLoading(true);

    try {
      const response = await fetch("/api/verify-star", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "star 검증에 실패했습니다");
      }

      await startAnalysis();
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-3xl space-y-4">
      <form onSubmit={handleSubmit} className="relative flex flex-col items-center justify-center gap-2 sm:flex-row">
        <label className="relative w-full">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-[#717785]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.69a4 4 0 015.66 5.66l-2.83 2.83a4 4 0 01-5.66 0m.45-1.87a4 4 0 01-5.66-5.66l2.83-2.83a4 4 0 015.66 0" />
            </svg>
          </span>
          <input
            type="text"
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setStep("idle");
              setPendingUsername("");
              setError("");
            }}
            onFocus={() => {
              if (!url) setUrl("https://github.com/");
            }}
            placeholder="https://github.com/username"
            disabled={isLoading}
            className="w-full rounded-lg border border-[#717785] bg-white py-4 pl-12 pr-4 text-base leading-6 text-[#181c22] shadow-sm transition-all placeholder:text-[#c1c6d5] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#005ab4] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="flex min-h-[58px] w-full items-center justify-center gap-1 whitespace-nowrap rounded-lg bg-[#005ab4] px-8 py-4 text-xs font-semibold uppercase tracking-[0.5px] text-white shadow-sm transition-colors hover:bg-[#0a73e0] focus:outline-none focus:ring-2 focus:ring-[#005ab4] focus:ring-offset-2 focus:ring-offset-[#f9f9ff] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {isLoading ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <>
              <span>분석하기</span>
              <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h14" />
              </svg>
            </>
          )}
        </button>
      </form>
      {error && (
        <p className="text-center text-sm font-medium text-[#ba1a1a]">{error}</p>
      )}
      {step === "confirm" && (
        <div className="rounded-xl border border-[#c1c6d5] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold leading-5 text-[#181c22]">
                분석 전 계정 소유 여부를 확인합니다
              </p>
              <p className="text-sm leading-6 text-[#414753]">
                <span className="font-semibold text-[#181c22]">{pendingUsername}</span> 계정으로{" "}
                <a
                  href={VERIFICATION_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[#005ab4] underline-offset-4 hover:underline"
                >
                  github_repo_analysis
                </a>
                에 star를 남긴 뒤 검증을 진행하세요. star 목록에서 해당 계정이 확인되면 분석이 시작됩니다.
              </p>
            </div>
            <button
              type="button"
              onClick={handleVerifyAndAnalyze}
              disabled={isLoading}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-[#181c22] px-5 py-3 text-xs font-semibold uppercase tracking-[0.5px] text-white transition-colors hover:bg-[#2f3540] focus:outline-none focus:ring-2 focus:ring-[#181c22] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <span>검증 후 분석</span>
                  <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M12 3a9 9 0 100 18 9 9 0 000-18z" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
