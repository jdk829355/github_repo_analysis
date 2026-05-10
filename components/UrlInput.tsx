"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UrlInput() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    if (!url.trim()) {
      setError("GitHub 프로필 URL을 입력해주세요");
      return;
    }

    const username = extractUsername(url);
    if (!username) {
      setError("올바른 GitHub 프로필 URL을 입력해주세요");
      return;
    }

    setIsLoading(true);

    try {
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
            onChange={(e) => setUrl(e.target.value)}
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
    </div>
  );
}
