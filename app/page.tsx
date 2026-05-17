import UrlInput from "@/components/UrlInput";

const featureCards = [
  {
    title: "저장소 분석",
    description: "리드미, 커밋 기록, 스타 수, 포크 수를 분석하여 프로젝트 유형과 기여도를 파악해요.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" />
      </svg>
    ),
  },
  {
    title: "기술 스택 분석",
    description: "사용된 언어와 프레임워크를 시각화하여 강점을 파악해요.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l-4 3 4 3m8-6l4 3-4 3M13 5l-2 14" />
      </svg>
    ),
  },
  {
    title: "프로필 요약",
    description: "분석 정보를 종합해서 프로필에 대한 분석을 제공해요.",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6h4m-7 4h10M7 14h6m-8 6h14a2 2 0 002-2V8a2 2 0 00-2-2h-3.5L14 4h-4L8.5 6H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f9f9ff] text-[#181c22] flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-4xl text-center">
        <div className="mb-8 space-y-4">
          <h1 className="text-[40px] leading-[48px] md:text-[48px] md:leading-[56px] font-extrabold tracking-tight text-[#181c22]">
            Pinned Signal
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-6 text-[#414753]">
            GitHub 프로필을 분석하여 프로젝트, 역할, 엔지니어링 강점을 발견하세요
          </p>
        </div>
        <div className="flex justify-center">
          <UrlInput />
        </div>
        <div className="mt-24 grid w-full grid-cols-1 gap-4 md:grid-cols-3">
          {featureCards.map(({ title, description, icon }) => (
            <section
              key={title}
              className="rounded-xl border border-[#e0e2eb] bg-[#f1f3fc] p-6 text-center shadow-sm"
            >
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#d6e3ff] text-[#005ab4]">
                {icon}
              </div>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.5px] text-[#181c22]">
                {title}
              </h2>
              <p className="text-sm leading-5 text-[#414753]">{description}</p>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
