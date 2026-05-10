# GitHub Profile Analyzer — Work Plan

## TL;DR

> **Quick Summary**: Build a Next.js web service that takes a GitHub profile URL, collects public repository data via GitHub API, analyzes commits and READMEs using Gemini LLM with structured output (Zod), and generates an engineering report viewable on web UI with SSE real-time updates and PDF export via Playwright.
> 
> **Deliverables**:
> - Next.js App Router application with TypeScript
> - GitHub API client with pagination, filtering, and caching
> - Gemini LLM pipeline (repo analysis → profile aggregation)
> - BullMQ background worker (separate Docker container)
> - SSE real-time progress updates
> - Progressive report rendering
> - Playwright PDF export
> - Docker Compose deployment (4 containers)
> - Full TDD test suite (Jest + cmux browser)
> 
> **Estimated Effort**: XL (full-stack greenfield, ~25 tasks)
> **Parallel Execution**: YES - 5 waves + Final
> **Critical Path**: T1 → T7 → T11 → T13 → T17 → T19 → F1-F4

---

## Context

### Original Request
GitHub Profile Analyzer — 사용자가 GitHub Profile URL을 입력하면, 해당 사용자의 repository 및 commit history를 분석하여 어떤 프로젝트를 수행했는지와 어떤 역할을 담당했는지를 자동으로 추론하는 서비스. 최종 결과는 웹 UI와 PDF 형태로 제공.

### Interview Summary
**Key Discussions**:
- Job Queue: BullMQ (Redis 기반) 선택
- ORM: Prisma 선택
- Gemini 모델: gemini-2.5-flash-lite
- Polling: SSE (Server-Sent Events) 선택
- 중복 URL: 캐시 활용 (TTL 내 기존 결과 즉시 반환)
- PDF: Playwright PDF (Puppeteer 대안)
- 부분 결과: 점진적 렌더링 (SSE로 완료된 리포 순서대로 표시)
- 동시성: 3개 동시 병렬 분석
- 부분 실패: 실패한 리포 스킵, 성공한 리포만으로 리포트 생성

**Research Findings**:
- BullMQ Worker는 반드시 별도 Docker 컨테이너로 실행 (Next.js 임베드 금지)
- Zod 스키마가 전체 시스템의 계약 — LLM 출력, DB 스키마, SSE 이벤트 모두 파생
- SSE 접속 시 즉시 현재 상태 이벤트 전송 필요 (재연결 대응)
- README 10KB 잘라내기 필요 (LLM 토큰 리밋 대응)
- GitHub API 페이지네이션 명시적 커서 추적 필수
- Playwright Docker는 mcr.microsoft.com/playwright 베이스 이미지 사용

### Metis Review
**Identified Gaps** (addressed):
- BullMQ Worker 배포 모델: 별도 Docker 컨테이너로 확정 (next-app + worker 분리)
- GitHub API 호출량 과부하: 50 repos × pagination = 2000+ API calls. Rate limit 대응 로직 필요
- 동일 URL 활성 작업 중 제출: 기존 jobId 반환 + "in progress" 상태
- SSE 재연결: 접속 시 즉시 현재 상태 이벤트 전송
- LLM 토큰 리밋: README 10KB 잘라내기, commit 로그 300개 제한
- Aggregation 실패: repo analyses 원본 저장 + "aggregation failed" 상태
- 최소 분석 가능 리포 수: 1개 (0개면 에러 메시지 반환)

---

## Work Objectives

### Core Objective
GitHub 공개 프로필 URL을 입력받아, 자동으로 repository 수집 → commit/README 분석 → 엔지니어링 리포트 생성 → SSE 실시간 진행 표시 → PDF 내보내기를 수행하는 Next.js 서비스를 구축한다.

### Concrete Deliverables
- `app/` — Next.js App Router 페이지 및 Route Handlers
- `lib/` — 서비스 레이어 (GitHub client, LLM client, cache, filtering)
- `services/` — 비즈니스 로직 (analysis pipeline, aggregation)
- `prompts/` — LLM 프롬프트 템플릿
- `schemas/` — Zod 스키마 (RepositoryAnalysis, ProfileReport)
- `workers/` — BullMQ 워커 프로세스 (별도 컨테이너)
- `tests/` — Jest 단위 테스트 + cmux browser E2E 테스트
- `docker/` — Docker Compose 설정 (next-app, worker, postgres, redis)

### Definition of Done
- [ ] GitHub URL 입력 → 분석 작업 생성 동작
- [ ] Repository 수집 → 필터링 → commit/README 분석 파이프라인 동작
- [ ] SSE 실시간 진행 상태 표시 동작
- [ ] 점진적 리포트 렌더링 동작
- [ ] Structured output Zod validation 통과
- [ ] PDF 다운로드 동작
- [ ] Jest tests 전부 통과
- [ ] Docker build + runtime 성공
- [ ] cmux browser E2E 테스트 통과

### Must Have
- GitHub 공개 프로필 URL 입력 및 검증
- Repository 수집 (최대 50개, fork/archived/empty 제외)
- Commit 수집 (최대 300개/repo, regex 필터링 적용)
- Gemini LLM structured output (Zod validation)
- 2단계 파이프라인: Repository Analysis → Profile Aggregation
- SSE 실시간 진행 상태 업데이트
- 점진적 리포트 렌더링 (완료된 리포 순서대로)
- PDF 내보내기 (Playwright 기반)
- BullMQ 백그라운드 작업 (별도 컨테이너)
- Redis 캐싱 (GitHub API, LLM 중간 결과)
- Docker Compose 배포 (4개 컨테이너)
- TDD (Jest 단위 테스트)
- 서비스 레이어 분리 (UI에서 Gemini 직접 호출 금지)

### Must NOT Have (Guardrails)
- 회원가입 / 로그인 / OAuth 인증 금지
- private repository 분석 금지
- WebSocket 금지 (SSE만 사용)
- UI 레이어에서 Gemini 직접 호출 금지
- request context에서 PDF 생성 금지 (반드시 BullMQ job)
- 원시 GitHub API 응답 캐시 금지 (최종 분석 결과만 캐시)
- 커스텀 분석 프롬프트 금지 (고정 템플릿만)
- 분석 히스토리 / 트렌드 비교 금지
- 데이터 시각화 (차트, 그래프) 금지 — 텍스트 기반 리포트만
- `as any` / `@ts-ignore` 금지
- console.log in prod 금지
- AI 슬롭: 과도한 주석, 과도한 추상화, 제네릭 이름 (data/result/item/temp)

---

## Verification Strategy (MANDATORY)

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.
> Acceptance criteria requiring "user manually tests/confirms" are FORBIDDEN.

### Test Decision
- **Infrastructure exists**: NO (greenfield project)
- **Automated tests**: YES (TDD)
- **Framework**: Jest
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task MUST include agent-executed QA scenarios (see TODO template below).
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Use Playwright (playwright skill) — Navigate, interact, assert DOM, screenshot
- **TUI/CLI**: Use interactive_bash (tmux) — Run command, send keystrokes, validate output
- **API/Backend**: Use Bash (curl) — Send requests, assert status + response fields
- **Library/Module**: Use Bash (node REPL) — Import, call functions, compare output

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — foundation + scaffolding):
├── T1: Zod schemas + Prisma schema + TS types [quick]
├── T2: Next.js project skeleton + Docker Compose [unspecified-high]
├── T3: Commit filtering service (pure function) [quick]
├── T4: LLM prompt templates [quick]
├── T5: Environment config + shared utilities [quick]

Wave 2 (After Wave 1 — core services):
├── T6: GitHub API client service (depends: T1, T2) [unspecified-high]
├── T7: Gemini LLM client service (depends: T1, T4) [deep]
├── T8: Redis caching layer (depends: T2) [quick]
├── T9: BullMQ worker infrastructure (depends: T2, T8) [unspecified-high]

Wave 3 (After Wave 2 — pipeline):
├── T10: Repository analysis pipeline (depends: T3, T6, T7, T8) [deep]
├── T11: Profile aggregation pipeline (depends: T7, T8, T10) [deep]
├── T12: Analysis job orchestrator (depends: T9, T10, T11) [deep]

Wave 4 (After Wave 3 — API + UI):
├── T13: API endpoints (depends: T12) [unspecified-high]
├── T14: SSE endpoint (depends: T9, T12) [unspecified-high]
├── T15: Landing page + URL input component (depends: T2) [visual-engineering]
├── T16: Analysis progress page (depends: T14) [visual-engineering]

Wave 5 (After Wave 4 — report + PDF):
├── T17: Report display page (depends: T13) [visual-engineering]
├── T18: PDF export via Playwright (depends: T13, T17) [deep]
├── T19: Error handling + edge case pages (depends: T13) [unspecified-high]

Wave FINAL (After ALL tasks — 4 parallel reviews, then user okay):
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
→ Present results → Get explicit user okay

Critical Path: T1 → T7 → T10 → T11 → T12 → T13 → T17 → T18 → F1-F4
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 5 (Waves 1 & 2)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| T1   | -         | T6, T7, T10, T11, T12, T13 | 1 |
| T2   | -         | T6, T8, T9, T15 | 1 |
| T3   | -         | T10 | 1 |
| T4   | -         | T7 | 1 |
| T5   | -         | T6, T7, T8, T9 | 1 |
| T6   | T1, T2, T5 | T10 | 2 |
| T7   | T1, T4, T5 | T10, T11 | 2 |
| T8   | T2, T5 | T10, T11, T9 | 2 |
| T9   | T2, T8 | T12, T14 | 2 |
| T10  | T3, T6, T7, T8 | T11, T12 | 3 |
| T11  | T7, T8, T10 | T12 | 3 |
| T12  | T9, T10, T11 | T13, T14 | 3 |
| T13  | T12 | T17, T18, T19 | 4 |
| T14  | T9, T12 | T16 | 4 |
| T15  | T2 | T16 | 4 |
| T16  | T14, T15 | - | 4 |
| T17  | T13 | T18 | 5 |
| T18  | T13, T17 | - | 5 |
| T19  | T13 | - | 5 |

### Agent Dispatch Summary

- **Wave 1**: 5 tasks — T1-T3, T5 → `quick`, T4 → `quick`, T2 → `unspecified-high`
- **Wave 2**: 4 tasks — T6 → `unspecified-high`, T7 → `deep`, T8 → `quick`, T9 → `unspecified-high`
- **Wave 3**: 3 tasks — T10 → `deep`, T11 → `deep`, T12 → `deep`
- **Wave 4**: 4 tasks — T13 → `unspecified-high`, T14 → `unspecified-high`, T15-T16 → `visual-engineering`
- **Wave 5**: 3 tasks — T17 → `visual-engineering`, T18 → `deep`, T19 → `unspecified-high`
- **FINAL**: 4 tasks — F1 → `oracle`, F2 → `unspecified-high`, F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [x] 1. Zod Schemas + Prisma Schema + TypeScript Types

  **What to do**:
  - Define Zod schemas for LLM structured output: `RepositoryAnalysisSchema` and `ProfileReportSchema` — these are THE contract for the entire system
  - Create Prisma schema with 5 tables: `analysis_jobs` (id, github_url, github_username, status enum [PENDING/PROCESSING/COMPLETED/FAILED], created_at, updated_at, error_message), `repositories` (id, job_id, name, description, language, stars, forks, updated_at, readme_content, status enum [PENDING/PROCESSING/COMPLETED/FAILED]), `repository_analyses` (id, repository_id, summary, project_type, estimated_roles[], main_contributions[], tech_stack[], leadership_signals[], confidence, raw_llm_output), `profile_reports` (id, job_id, overall_summary, role_estimation[], engineering_strengths[], collaboration_patterns[], raw_llm_output), `pdf_exports` (id, report_id, file_path, created_at)
  - Export TypeScript types from Zod schemas using `z.infer<typeof XSchema>`
  - Add `analysis_jobs` status enum: PENDING → PROCESSING → COMPLETED | FAILED
  - Write RED test first: test that Zod schemas validate valid/invalid data, test Prisma schema generates correct types
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT add ORM methods or database queries (just schema definition)
  - Do NOT add any API endpoints
  - Do NOT design SSE event types (separate concern)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition is mechanical, well-defined work
  - **Skills**: [`fastapi`]
    - `fastapi`: Pydantic/Zod schema patterns transfer — structured output validation expertise
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T2, T3, T4, T5)
  - **Blocks**: T6, T7, T10, T11, T12, T13
  - **Blocked By**: None (can start immediately)

  **References** (CRITICAL):

  **Pattern References**:
  - (No existing codebase — greenfield project)
  - PRD Section 14: LLM Processing Pipeline — defines output shape for Repository Analysis and Profile Aggregation

  **API/Type References**:
  - PRD Section 14, Step 1: `RepositoryAnalysisSchema` fields — repositoryName, summary, projectType, estimatedRoles[], mainContributions[], techStack[], leadershipSignals[], confidence
  - PRD Section 14, Step 2: `ProfileReportSchema` fields — overallSummary, roleEstimation, engineeringStrengths, collaborationPatterns
  - PRD Section 12: Database tables — analysis_jobs, repositories, repository_analyses, profile_reports, pdf_exports

  **External References**:
  - Zod schema definition: https://zod.dev/?id=basic-usage
  - Prisma schema reference: https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference

  **WHY Each Reference Matters**:
  - PRD Section 14 defines the exact LLM output JSON shape — Zod schemas MUST match this
  - PRD Section 12 defines required DB tables — Prisma schema MUST cover all 5 tables
  - Zod docs for correct schema definition syntax
  - Prisma docs for correct schema syntax and type generation

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/schemas/validation.test.ts`
  - [ ] `npx jest tests/schemas/validation.test.ts` → PASS (valid data passes, invalid data fails)

  **QA Scenarios (MANDATORY):**

  ```
  Scenario: Zod schema validates valid RepositoryAnalysis data
    Tool: Bash (node)
    Preconditions: Zod schemas and TypeScript types exported
    Steps:
      1. Run `npx jest tests/schemas/validation.test.ts`
      2. Verify all test cases pass
      3. Check that valid RepositoryAnalysis data passes validation
      4. Check that missing required fields fail validation
    Expected Result: All tests pass, valid data accepted, invalid data rejected
    Failure Indicators: Any test fails, validation accepts malformed data
    Evidence: .sisyphus/evidence/task-1-schema-validation.txt

  Scenario: Prisma schema generates valid types
    Tool: Bash
    Preconditions: Prisma schema file exists
    Steps:
      1. Run `npx prisma validate`
      2. Run `npx prisma generate`
      3. Verify generated types include all 5 tables
    Expected Result: Prisma validate passes, generate produces client
    Failure Indicators: Validation errors, missing tables in generated types
    Evidence: .sisyphus/evidence/task-1-prisma-generate.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-1-schema-validation.txt, task-1-prisma-generate.txt
  - [ ] Terminal output from jest and prisma commands

  **Commit**: YES (groups with T2, T3, T4, T5)
  - Message: `feat(scaffold): add Zod schemas, Prisma schema, and TypeScript types`
  - Files: `schemas/*.ts`, `prisma/schema.prisma`, `types/*.ts`
  - Pre-commit: `npx jest tests/schemas/ && npx prisma validate`

- [x] 2. Next.js Project Skeleton + Docker Compose

  **What to do**:
  - Initialize Next.js project with App Router, TypeScript, TailwindCSS
  - Set up directory structure: `/app`, `/components`, `/lib`, `/services`, `/prompts`, `/schemas`, `/workers`, `/tests`, `/docker`
  - Create Docker Compose file with 4 services: `next-app` (Next.js), `worker` (BullMQ processor), `postgres` (PostgreSQL 16), `redis` (Redis 7 with `appendonly yes`)
  - Create Dockerfile for next-app and worker (worker shares Dockerfile but different entrypoint)
  - Create `.env.example` with all required environment variables: `GITHUB_TOKEN`, `GEMINI_API_KEY`, `DATABASE_URL`, `REDIS_URL`, `NEXT_PUBLIC_APP_URL`
  - Set up Prisma client generation in Next.js build
  - Configure `next.config.ts` for Docker-optimized build (standalone output)
  - Write RED test first: test that `docker compose config` validates and shows 4 services
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement any business logic or pages
  - Do NOT add any API routes yet
  - Do NOT install Gemini or BullMQ dependencies yet (separate tasks)
  - Do NOT configure Playwright for PDF yet (separate task)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Docker + Next.js setup requires careful configuration, not trivial
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: No UI work yet

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T3, T4, T5)
  - **Blocks**: T6, T8, T9, T15
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - Next.js App Router project structure: https://nextjs.org/docs/app/building-your-application/routing
  - Docker Compose with Next.js: https://nextjs.org/docs/app/building-your-application/deploying#docker-image

  **API/Type References**:
  - PRD Section 8: Tech stack — Next.js App Router, TypeScript, TailwindCSS, Next.js Route Handlers, PostgreSQL, Redis
  - PRD Section 23: Docker requirements — next-app, postgres, redis containers
  - PRD Section 24: Directory structure — /app, /components, /lib, /services, /prompts, /schemas, /tests, /docker
  - PRD Section 9: Environment variables — GITHUB_TOKEN, GEMINI_API_KEY, DATABASE_URL, REDIS_URL, NEXT_PUBLIC_APP_URL

  **External References**:
  - Next.js Docker guide: https://nextjs.org/docs/app/building-your-application/deploying#docker-image
  - Prisma with Docker: https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-docker

  **WHY Each Reference Matters**:
  - PRD Sections 8, 23, 24 define exact tech stack and directory structure — MUST match
  - PRD Section 9 defines required environment variables — .env.example MUST include all 5
  - Next.js standalone output mode is critical for Docker optimization
  - Redis needs `appendonly yes` for persistence (Metis finding)

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/integration/skeleton.test.ts`
  - [ ] `npx jest tests/integration/skeleton.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Docker Compose validates with 4 services
    Tool: Bash
    Preconditions: docker-compose.yml exists
    Steps:
      1. Run `docker compose config`
      2. Verify services list contains: next-app, worker, postgres, redis
      3. Verify redis service has appendonly yes configuration
    Expected Result: Config validates successfully, 4 services defined
    Failure Indicators: Config validation fails, missing services, missing redis persistence
    Evidence: .sisyphus/evidence/task-2-docker-config.txt

  Scenario: Next.js project starts in development mode
    Tool: Bash
    Preconditions: node_modules installed
    Steps:
      1. Run `npm install`
      2. Run `npx next build`
      3. Verify build succeeds with exit code 0
    Expected Result: Build succeeds, no errors
    Failure Indicators: Build fails, TypeScript errors, missing dependencies
    Evidence: .sisyphus/evidence/task-2-next-build.txt

  Scenario: Docker containers start successfully
    Tool: Bash
    Preconditions: Docker running
    Steps:
      1. Run `docker compose up -d`
      2. Wait 15 seconds
      3. Run `docker compose ps`
      4. Verify all 4 containers are running
      5. Run `docker compose down`
    Expected Result: All 4 containers show "running" status
    Failure Indicators: Any container exits, health check fails
    Evidence: .sisyphus/evidence/task-2-docker-up.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-2-docker-config.txt, task-2-next-build.txt, task-2-docker-up.txt
  - [ ] Terminal output from commands

  **Commit**: YES (groups with T1, T3, T4, T5)
  - Message: `feat(scaffold): add Zod schemas, Prisma schema, and TypeScript types`
  - Files: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `prisma/schema.prisma`
  - Pre-commit: `npx next build && docker compose config`

- [x] 3. Commit Filtering Service

  **What to do**:
  - Implement commit filtering as pure functions in `lib/commit-filter.ts`
  - Regex patterns from PRD Section 5.5: ^merge, ^merged, ^typo, ^fix lint, ^lint, ^format, ^prettier, ^eslint, ^style, ^docs, ^doc, ^readme, ^bump, ^chore, ^update dependency, ^dependabot, ^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}, ^[0-9]{6,8}$, ^wip$, ^temp$
  - Additional filters: meaningless one-word commit, dependency update, archive/memo commit, formatting-only commit
  - Implement `filterCommits(commits: Commit[]): Commit[]` that returns only meaningful commits
  - Implement `isMergeCommit(commit: Commit): boolean`
  - Implement `isMeaningfulCommit(commit: Commit): boolean`
  - Write RED test first: test all regex patterns, edge cases (empty commits, Unicode messages, very long messages)
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement GitHub API calls (separate task)
  - Do NOT implement LLM integration
  - Do NOT add any API endpoints

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure function, well-defined input/output, testable in isolation
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T4, T5)
  - **Blocks**: T10
  - **Blocked By**: None (can start immediately)

  **References**:

  **API/Type References**:
  - PRD Section 5.4: Commit collection rules — max 300 per repo, authored only, no merge commits
  - PRD Section 5.5: Commit filtering regex patterns — all 16 patterns listed
  - PRD Section 5.5: Additional exclusion rules — meaningless one-word, dependency update, archive/memo, formatting-only

  **Test References**:
  - PRD Section 22: Testing requirements — commit filtering is listed as unit test scope

  **WHY Each Reference Matters**:
  - PRD Section 5.5 defines EXACT regex patterns — implementation MUST match these exactly
  - These patterns determine which commits are analyzed by the LLM — incorrect filtering = wrong analysis

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/lib/commit-filter.test.ts`
  - [ ] `npx jest tests/lib/commit-filter.test.ts` → PASS (all regex patterns + edge cases)

  **QA Scenarios:**

  ```
  Scenario: All 16 regex patterns correctly filter commits
    Tool: Bash (node)
    Preconditions: commit-filter.ts implemented with all patterns
    Steps:
      1. Run `npx jest tests/lib/commit-filter.test.ts`
      2. Verify "merge pull request" is filtered
      3. Verify "typo fix" is filtered
      4. Verify "chore: update deps" is filtered
      5. Verify "feat: add login page" is NOT filtered
      6. Verify "2024-01-15 daily log" is filtered
    Expected Result: All regex patterns work correctly, meaningful commits pass through
    Failure Indicators: Any regex pattern fails, meaningful commit incorrectly filtered
    Evidence: .sisyphus/evidence/task-3-filter-test.txt

  Scenario: Edge cases handled — Unicode, empty, very long commits
    Tool: Bash (node)
    Preconditions: commit-filter.ts handles edge cases
    Steps:
      1. Test with empty array input → returns empty array
      2. Test with Unicode commit message "기능: 로그인 추가" → passes filter
      3. Test with very long commit message (500+ chars) → passes filter
      4. Test with single word commit "fix" → filtered as meaningless
    Expected Result: Edge cases handled correctly, no crashes
    Failure Indicators: Throws on edge cases, filters incorrectly
    Evidence: .sisyphus/evidence/task-3-filter-edge.txt
  ```

  **Evidence to Capture:**
  - [ ] Each evidence file named: task-3-filter-test.txt, task-3-filter-edge.txt
  - [ ] Terminal output from jest

  **Commit**: YES (groups with T1, T2, T4, T5)
  - Message: `feat(scaffold): add Zod schemas, Prisma schema, and TypeScript types`
  - Files: `lib/commit-filter.ts`, `tests/lib/commit-filter.test.ts`
  - Pre-commit: `npx jest tests/lib/commit-filter.test.ts`

- [x] 4. LLM Prompt Templates

  **What to do**:
  - Create prompt templates in `prompts/` directory
  - `prompts/repository-analysis.ts`: Template for Step 1 — Repository Analysis. Must include: input format (README, commit logs, repo metadata), output format (JSON matching RepositoryAnalysisSchema), anti-hallucination instructions, specific analysis instructions (role estimation, contribution identification)
  - `prompts/profile-aggregation.ts`: Template for Step 2 — Profile Aggregation. Must include: input format (array of repository analyses), output format (JSON matching ProfileReportSchema), synthesis instructions (overall summary, role estimation, engineering strengths, collaboration patterns)
  - `prompts/types.ts`: Shared types for prompt input/output
  - Write RED test first: test that prompts render with valid inputs, test that prompts include required sections
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement Gemini API client (separate task — T7)
  - Do NOT implement any analysis pipeline logic
  - Do NOT customize prompts per user — fixed templates only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Template creation is well-defined, mechanical work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T5)
  - **Blocks**: T7
  - **Blocked By**: None (can start immediately)

  **References**:

  **API/Type References**:
  - PRD Section 14 Step 1: Repository Analysis — input (README, commit logs, repo metadata), output (repositoryName, summary, projectType, estimatedRoles, mainContributions, techStack, leadershipSignals, confidence)
  - PRD Section 14 Step 2: Profile Aggregation — input (array of repo analyses), output (overallSummary, roleEstimation, engineeringStrengths, collaborationPatterns)
  - PRD Section 16: Prompt Engineering Rules — template separation, output format specification, hallucination minimization
  - PRD Section 7: Role Estimation Rules — Backend, Frontend, DevOps, ML, Technical Lead, Maintainer, Architecture Contributor

  **WHY Each Reference Matters**:
  - PRD Section 14 defines exact input/output shapes — prompts MUST match
  - PRD Section 16 mandates separated prompt templates — must be in separate files
  - PRD Section 7 defines roles to estimate — prompts MUST instruct LLM to look for these signals

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/prompts/templates.test.ts`
  - [ ] `npx jest tests/prompts/templates.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Repository analysis prompt renders with valid input
    Tool: Bash (node)
    Preconditions: Prompt templates implemented
    Steps:
      1. Run `npx jest tests/prompts/templates.test.ts`
      2. Verify repository analysis prompt includes README placeholder
      3. Verify prompt includes commit logs placeholder
      4. Verify prompt specifies JSON output format matching RepositoryAnalysisSchema
      5. Verify prompt includes anti-hallucination instructions
    Expected Result: All prompt template tests pass
    Failure Indicators: Missing placeholders, wrong output format, missing instructions
    Evidence: .sisyphus/evidence/task-4-prompt-test.txt

  Scenario: Profile aggregation prompt includes all required sections
    Tool: Bash (node)
    Preconditions: Aggregation prompt implemented
    Steps:
      1. Verify prompt includes overall summary section
      2. Verify prompt includes role estimation instructions
      3. Verify prompt includes engineering strengths section
      4. Verify prompt includes collaboration patterns section
    Expected Result: All sections present in aggregation prompt
    Failure Indicators: Missing sections, incomplete instructions
    Evidence: .sisyphus/evidence/task-4-aggregation-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-4-prompt-test.txt, task-4-aggregation-test.txt
  - [ ] Terminal output from jest

  **Commit**: YES (groups with T1, T2, T3, T5)
  - Message: `feat(scaffold): add Zod schemas, Prisma schema, and TypeScript types`
  - Files: `prompts/repository-analysis.ts`, `prompts/profile-aggregation.ts`, `prompts/types.ts`, `tests/prompts/templates.test.ts`
  - Pre-commit: `npx jest tests/prompts/`

- [x] 5. Environment Config + Shared Utilities

  **What to do**:
  - Create `lib/config.ts` for typed environment variable access with validation (GITHUB_TOKEN, GEMINI_API_KEY, DATABASE_URL, REDIS_URL, NEXT_PUBLIC_APP_URL)
  - Create `lib/constants.ts` for app constants: MAX_REPOS=50, MAX_COMMITS_PER_REPO=300, MAX_CONCURRENT_ANALYSIS=3, ANALYSIS_TIMEOUT_MS=600000, README_MAX_SIZE_BYTES=10240, GITHUB_API_VERSION="2022-11-28"
  - Create `lib/errors.ts` for custom error classes: `GitHubAPIError`, `GeminiAPIError`, `AnalysisError`, `ValidationError`
  - Create `lib/utils.ts` for shared utilities: `truncateToMaxSize(text: string, maxBytes: number): string`, `normalizeGitHubUrl(url: string): string`, `hashUrl(url: string): string` (for BullMQ job dedup)
  - Write RED tests first: test config validation, test utility functions with edge cases
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT add any API route handlers
  - Do NOT connect to any external services yet
  - Do NOT add any React components

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Configuration and utility functions are mechanical, well-defined
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with T1, T2, T3, T4)
  - **Blocks**: T6, T7, T8, T9
  - **Blocked By**: None (can start immediately)

  **References**:

  **API/Type References**:
  - PRD Section 9: Environment variables — GITHUB_TOKEN, GEMINI_API_KEY, DATABASE_URL, REDIS_URL, NEXT_PUBLIC_APP_URL
  - PRD Section 19: Security constraints — input validation, limits (max 50 repos, max 300 commits, concurrent 3, timeout 10min)
  - PRD Section 18: Retry policy — GitHub API exponential backoff max 3, Gemini retry max 2

  **WHY Each Reference Matters**:
  - PRD Section 9 defines required env vars — config MUST include all 5
  - PRD Section 19 defines hard limits — constants MUST match these exactly
  - GitHub API version header prevents future breakage (Metis finding)

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/lib/config.test.ts`, `tests/lib/utils.test.ts`
  - [ ] `npx jest tests/lib/config.test.ts tests/lib/utils.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Config validates required environment variables
    Tool: Bash (node)
    Preconditions: lib/config.ts implemented
    Steps:
      1. Set all required env vars
      2. Run config validation → passes
      3. Remove GITHUB_TOKEN → validation fails with clear error
      4. Remove GEMINI_API_KEY → validation fails with clear error
    Expected Result: Config validates all required env vars, clear error messages
    Failure Indicators: Missing env var not caught, generic error message
    Evidence: .sisyphus/evidence/task-5-config-test.txt

  Scenario: Utility functions handle edge cases
    Tool: Bash (node)
    Preconditions: lib/utils.ts implemented
    Steps:
      1. Test `normalizeGitHubUrl("https://github.com/torvalds")` → "torvalds"
      2. Test `normalizeGitHubUrl("https://github.com/torvalds/")` → "torvalds" (trailing slash)
      3. Test `normalizeGitHubUrl("github.com/torvalds")` → "torvalds" (no protocol)
      4. Test `normalizeGitHubUrl("invalid-url")` → throws ValidationError
      5. Test `truncateToMaxSize(longText, 10240)` → truncated to 10KB
      6. Test `hashUrl("https://github.com/torvalds")` → consistent hash
    Expected Result: All edge cases handled correctly
    Failure Indicators: Throws on valid input, inconsistent normalization
    Evidence: .sisyphus/evidence/task-5-utils-test.txt
  ```

  **Evidence to Capture:**
  - [ ] task-5-config-test.txt, task-5-utils-test.txt
  - [ ] Terminal output from jest

  **Commit**: YES (groups with T1, T2, T3, T4)
  - Message: `feat(scaffold): add Zod schemas, Prisma schema, and TypeScript types`
  - Files: `lib/config.ts`, `lib/constants.ts`, `lib/errors.ts`, `lib/utils.ts`, `tests/lib/config.test.ts`, `tests/lib/utils.test.ts`
  - Pre-commit: `npx jest tests/lib/`

- [x] 6. GitHub API Client Service

  **What to do**:
  - Implement `services/github-client.ts` for GitHub REST API v3
  - Functions: `getUserProfile(username)`, `getUserRepositories(username, page, perPage)`, `getRepositoryReadme(owner, repo)`, `getRepositoryCommits(owner, repo, page, perPage, author=username)`
  - GitHub API version header: `X-GitHub-Api-Version: 2022-11-28` on all requests
  - Authentication: `Authorization: Bearer ${GITHUB_TOKEN}` header on all requests
  - Pagination: Explicit cursor tracking, max 100 per page, iterate until all repos collected or 50 limit reached
  - Rate limit handling: Check `x-ratelimit-remaining` header, log warnings when < 100, wait on 403 with exponential backoff
  - Error handling: 404 → `GitHubAPIError("Profile not found")`, 403 → rate limit + retry, 500 → retry
  - Retry policy: Exponential backoff, max 3 retries (as per PRD Section 18)
  - Truncation: README content truncated to 10KB (`truncateToMaxSize` from T5)
  - Repository filtering (PRD Section 5.3): Skip fork repos, archived repos, empty repos — mark as filtered, not error
  - Write RED tests first: mock GitHub API responses, test pagination, test rate limit handling, test 404 handling
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement LLM integration
  - Do NOT implement analysis pipeline logic
  - Do NOT cache API responses (T8 handles caching)
  - Do NOT add any API endpoints

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: GitHub API client requires pagination, rate limits, retry logic — non-trivial but well-defined
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (with T7, T8, T9)
  - **Blocks**: T10
  - **Blocked By**: T1 (types), T2 (skeleton), T5 (config/errors/constants)

  **References**:

  **Pattern References**:
  - `lib/config.ts`: Environment variable access pattern (from T5)
  - `lib/errors.ts`: Custom error classes (from T5)
  - `lib/constants.ts`: MAX_REPOS, MAX_COMMITS_PER_REPO, GITHUB_API_VERSION (from T5)
  - `lib/utils.ts`: truncateToMaxSize, normalizeGitHubUrl (from T5)

  **API/Type References**:
  - PRD Section 5.2: Repository metadata to collect — name, description, primary language, stars, forks, updated date
  - PRD Section 5.2: Repository content — README, commit logs
  - PRD Section 5.3: Repository filtering — skip fork, archived, empty repos
  - PRD Section 5.4: Commit collection — max 300, authored only, no merge commits
  - PRD Section 18: Retry policy — exponential backoff, max 3

  **External References**:
  - GitHub REST API: https://docs.github.com/en/rest?apiVersion=2022-11-28
  - GitHub API pagination: https://docs.github.com/en/rest/guides/using-pagination-in-the-rest-api

  **WHY Each Reference Matters**:
  - T5 utilities are used directly (truncation, config, errors) — must import correctly
  - PRD Sections 5.2-5.4 define exact data to collect — API client MUST return this data
  - GitHub API version header prevents future breakage (Metis finding)
  - Pagination docs for correct implementation

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/services/github-client.test.ts`
  - [ ] `npx jest tests/services/github-client.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: GitHub client fetches user repositories with pagination
    Tool: Bash (node)
    Preconditions: GitHub API client implemented with mocks
    Steps:
      1. Test getUserRepositories("torvalds", { page: 1, perPage: 100 })
      2. Verify 100 items returned on first page
      3. Test pagination continues until all repos fetched or 50 limit reached
      4. Verify fork/archived/empty repos are filtered out
    Expected Result: Repositories fetched correctly, fork/archived/empty excluded
    Failure Indicators: Pagination fails, filtered repos included
    Evidence: .sisyphus/evidence/task-6-github-pagination.txt

  Scenario: GitHub client handles rate limit and 404
    Tool: Bash (node)
    Preconditions: Mock server returning 403 rate limit and 404
    Steps:
      1. Test getUserProfile("nonexistent-user-12345") → throws GitHubAPIError with "not found"
      2. Test rate limit (403) → retries with exponential backoff, max 3 attempts
      3. Test 500 → retries with exponential backoff
    Expected Result: 404 throws clear error, 403/500 retries correctly
    Failure Indicators: No retry on 403, unclear error message on 404
    Evidence: .sisyphus/evidence/task-6-github-errors.txt
  ```

  **Evidence to Capture:**
  - [ ] task-6-github-pagination.txt, task-6-github-errors.txt
  - [ ] Terminal output from jest

  **Commit**: YES (groups with T7, T8, T9)
  - Message: `feat(services): add GitHub client, LLM client, Redis cache, BullMQ worker`
  - Files: `services/github-client.ts`, `tests/services/github-client.test.ts`
  - Pre-commit: `npx jest tests/services/github-client.test.ts`

- [x] 7. Gemini LLM Client Service

  **What to do**:
  - Implement `services/llm-client.ts` for Gemini API with structured output
  - Use `@google/generative-ai` SDK with model `gemini-2.5-flash-lite`
  - Temperature: 0.1 (deterministic output)
  - Implement `analyzeRepository(input: RepositoryAnalysisInput): RepositoryAnalysis` — calls repo analysis prompt, validates with `RepositoryAnalysisSchema`, retries on Zod validation failure (max 2 retries per PRD Section 15)
  - Implement `aggregateProfile(input: ProfileAggregationInput): ProfileReport` — calls aggregation prompt, validates with `ProfileReportSchema`, retries on Zod validation failure (max 2)
  - Error handling: Timeout → retry (max 2), Malformed output → retry (max 2), Schema mismatch → retry (max 2)
  - If all retries fail: log error, return `AnalysisError` with partial data
  - README truncation to 10KB before sending to LLM
  - Structured output MUST use Zod schema validation — no raw freeform responses
  - Write RED tests first: mock Gemini API responses, test Zod validation success/failure, test retry on malformed output, test timeout handling
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement analysis pipeline (T10, T11)
  - Do NOT call Gemini from UI layer
  - Do NOT allow raw freeform responses (must use structured output with Zod)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: LLM client with structured output, Zod validation, retry logic — complex and critical
  - **Skills**: [`fastapi`]
    - `fastapi`: Pydantic structured output patterns transfer — schema validation expertise
  - **Skills Evaluated but Omitted**:
    - `frontend-design`: Not UI work

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (with T6, T8, T9)
  - **Blocks**: T10, T11
  - **Blocked By**: T1 (Zod schemas), T4 (prompt templates), T5 (config/errors)

  **References**:

  **Pattern References**:
  - `schemas/repository-analysis.ts`: RepositoryAnalysisSchema — the Zod schema to validate against (from T1)
  - `schemas/profile-report.ts`: ProfileReportSchema — the Zod schema to validate against (from T1)
  - `prompts/repository-analysis.ts`: Prompt template (from T4)
  - `prompts/profile-aggregation.ts`: Prompt template (from T4)
  - `lib/config.ts`: GEMINI_API_KEY (from T5)
  - `lib/errors.ts`: GeminiAPIError (from T5)

  **API/Type References**:
  - PRD Section 8 AI: Gemini Flash-Lite model, Structured Output, deterministic temperature
  - PRD Section 14: LLM Processing Pipeline — two-step process (repo analysis → aggregation)
  - PRD Section 15: Structured Output Rules — Zod validation, no freeform, malformed retry, deterministic temperature
  - PRD Section 18: Gemini retry policy — malformed output retry, timeout retry, max 2

  **External References**:
  - Gemini API SDK: https://ai.google.dev/docs
  - Gemini Structured Output: https://ai.google.dev/gemini-api/docs/structured-output

  **WHY Each Reference Matters**:
  - T1 Zod schemas are the contract — LLM client MUST validate against these
  - T4 prompt templates define the input format — MUST use these templates
  - PRD Section 15 mandates structured output with Zod — no raw responses allowed
  - Gemini docs for correct SDK usage

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/services/llm-client.test.ts`
  - [ ] `npx jest tests/services/llm-client.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: LLM client validates structured output with Zod
    Tool: Bash (node)
    Preconditions: LLM client implemented with mocked Gemini responses
    Steps:
      1. Test analyzeRepository with valid Gemini response → passes Zod validation
      2. Test analyzeRepository with malformed JSON → triggers retry
      3. Test analyzeRepository with valid JSON but missing fields → triggers retry
      4. Test after 2 retries → throws GeminiAPIError with "malformed output"
    Expected Result: Valid responses pass, malformed responses retry then fail gracefully
    Failure Indicators: Zod validation skipped, malformed output accepted
    Evidence: .sisyphus/evidence/task-7-llm-validation.txt

  Scenario: LLM client handles timeout and rate limit
    Tool: Bash (node)
    Preconditions: Mock server returning timeouts
    Steps:
      1. Test analyzeRepository with timeout → retries (max 2)
      2. Test aggregateProfile with timeout → retries (max 2)
      3. Verify temperature is set to 0.1
    Expected Result: Timeouts trigger retries, temperature verified
    Failure Indicators: No retry on timeout, wrong temperature value
    Evidence: .sisyphus/evidence/task-7-llm-timeout.txt
  ```

  **Evidence to Capture:**
  - [ ] task-7-llm-validation.txt, task-7-llm-timeout.txt
  - [ ] Terminal output from jest

  **Commit**: YES (groups with T6, T8, T9)
  - Message: `feat(services): add GitHub client, LLM client, Redis cache, BullMQ worker`
  - Files: `services/llm-client.ts`, `tests/services/llm-client.test.ts`
  - Pre-commit: `npx jest tests/services/llm-client.test.ts`

- [x] 8. Redis Caching Layer

  **What to do**:
  - Implement `services/cache.ts` for Redis caching
  - Functions: `getCachedAnalysis(username: string): ProfileReport | null`, `setCachedAnalysis(username: string, report: ProfileReport): void`, `getCachedLLMOutput(key: string): any | null`, `setCachedLLMOutput(key: string, data: any): void`
  - Cache key naming: `gh:{username}:repos` for repo list, `gh:{username}:{repo}:readme` for README, `llm:repo:{username}:{repo}` for repo analysis result, `llm:profile:{username}` for profile aggregation result
  - TTL strategy: GitHub API responses → 1 hour, LLM intermediate outputs → 24 hours, final analysis results → 7 days
  - Use `ioredis` client with `REDIS_URL` from config
  - BullMQ job deduplication: Use job ID based on `hashUrl(username)` — check for existing active job before creating new one
  - Write RED tests first: test cache hit/miss, test TTL expiry, test key naming, test job dedup
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT cache raw GitHub API responses (only cache final analysis results and LLM intermediate outputs, per guardrails)
  - Do NOT implement BullMQ job processing (T9 handles that)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Redis caching is well-defined, TTL-based, straightforward
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (with T6, T7, T9)
  - **Blocks**: T10, T11
  - **Blocked By**: T2 (skeleton), T5 (config)

  **References**:

  **Pattern References**:
  - `lib/config.ts`: REDIS_URL access (from T5)

  **API/Type References**:
  - PRD Section 13: Redis Cache Strategy — cache GitHub API responses, README content, commit logs, LLM intermediate outputs
  - PRD Section 19: Security limits — analysis timeout 10 minutes

  **External References**:
  - ioredis docs: https://github.com/redis/ioredis

  **WHY Each Reference Matters**:
  - PRD Section 13 defines what to cache — implementation MUST cover these categories
  - Metis finding: Only cache final analysis results, not raw GitHub API responses (guardrails)
  - ioredis is the standard Redis client for Node.js

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/services/cache.test.ts`
  - [ ] `npx jest tests/services/cache.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Redis cache set and get works correctly
    Tool: Bash (node)
    Preconditions: Redis running in Docker
    Steps:
      1. Set `gh:torvalds:repos` with TTL 3600
      2. Get `gh:torvalds:repos` → returns cached data
      3. Wait for TTL expiry (mock time) → returns null
      4. Set `llm:repo:torvalds:linux` with TTL 86400
      5. Get `llm:repo:torvalds:linux` → returns cached data
    Expected Result: Cache hit/miss works, TTL expiry works correctly
    Failure Indicators: Cache miss on hit, data persists beyond TTL
    Evidence: .sisyphus/evidence/task-8-cache-test.txt

  Scenario: Job deduplication prevents duplicate analysis
    Tool: Bash (node)
    Preconditions: Redis running, job dedup implemented
    Steps:
      1. Check for existing active job for username "torvalds" → no job found
      2. Create job dedup key
      3. Check again → job found (from step 2)
    Expected Result: Duplicate job detection works
    Failure Indicators: Duplicate jobs created for same username
    Evidence: .sisyphus/evidence/task-8-cache-dedup.txt
  ```

  **Evidence to Capture:**
  - [ ] task-8-cache-test.txt, task-8-cache-dedup.txt
  - [ ] Terminal output from jest

  **Commit**: YES (groups with T6, T7, T9)
  - Message: `feat(services): add GitHub client, LLM client, Redis cache, BullMQ worker`
  - Files: `services/cache.ts`, `tests/services/cache.test.ts`
  - Pre-commit: `npx jest tests/services/cache.test.ts`

- [x] 9. BullMQ Worker Infrastructure

  **What to do**:
  - Implement `workers/analysis-worker.ts` as a standalone Node.js process (separate Docker container)
  - BullMQ queue setup: `analysisQueue` with concurrency 3 (per PRD Section 19)
  - Job processor: receives `{ username: string, githubUrl: string }`, orchestrates the full pipeline (T10, T11, T12)
  - Job lifecycle states: PENDING → PROCESSING → COMPLETED | FAILED
  - SSE event publishing: Publish progress events to Redis pub/sub channel `analysis:{jobId}:events`
  - Worker entry point: `workers/index.ts` that starts the BullMQ worker process
  - Docker Compose: Add `worker` service with same Dockerfile as next-app but different entrypoint (`node workers/index.js`)
  - BullMQ configuration: `attempts: 2`, `backoff: { type: 'exponential', delay: 5000 }`, `stalledJobCheckInterval: 30000`, `maxStalledCount: 1`
  - Configure Redis persistence: `command: redis-server --appendonly yes`
  - Write RED tests first: test job lifecycle, test concurrency, test failure handling
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement pipeline logic (T10, T11, T12 handle that)
  - Do NOT embed worker in Next.js process (must be separate container)
  - Do NOT add WebSocket support (SSE only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: BullMQ worker setup with Docker separation, pub/sub — non-trivial infrastructure
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 2)
  - **Parallel Group**: Wave 2 (with T6, T7, T8)
  - **Blocks**: T12, T14
  - **Blocked By**: T2 (skeleton for Docker), T8 (Redis cache)

  **References**:

  **Pattern References**:
  - `lib/config.ts`: REDIS_URL (from T5)
  - `lib/constants.ts`: MAX_CONCURRENT_ANALYSIS, ANALYSIS_TIMEOUT_MS (from T5)
  - `docker-compose.yml`: existing Docker Compose setup (from T2)

  **API/Type References**:
  - PRD Section 11: Background Job Architecture — submit → create job → enqueue → polling → report
  - PRD Section 19: Concurrent repository analysis limit: 3
  - PRD Section 18: Retry policy — exponential backoff, max retries
  - PRD Section 23: Docker containers — next-app, postgres, redis (+ worker)

  **External References**:
  - BullMQ docs: https://docs.bullmq.io/
  - BullMQ Docker best practices: https://docs.bullmq.io/guide/connections

  **WHY Each Reference Matters**:
  - PRD Section 11 defines the job architecture — BullMQ worker MUST follow this flow
  - PRD Section 19 sets concurrency to 3 — MUST configure this in BullMQ
  - Worker must be separate container (Metis finding — critical architectural decision)
  - BullMQ docs for correct configuration

  **Acceptance Criteria**:

  **If TDD (tests enabled):**
  - [ ] Test file created: `tests/workers/analysis-worker.test.ts`
  - [ ] `npx jest tests/workers/analysis-worker.test.ts` → PASS

  **QA Scenarios:**

  ```
  Scenario: Worker processes job with correct lifecycle
    Tool: Bash (node)
    Preconditions: Worker implemented, Redis running
    Steps:
      1. Add job to analysisQueue with `{ username: "testuser", githubUrl: "https://github.com/testuser" }`
      2. Verify job transitions: PENDING → PROCESSING → COMPLETED
      3. Verify SSE events published to Redis pub/sub
    Expected Result: Job lifecycle follows correct state transitions
    Failure Indicators: Job stuck in PENDING, SSE events not published
    Evidence: .sisyphus/evidence/task-9-worker-lifecycle.txt

  Scenario: Worker respects concurrency limit of 3
    Tool: Bash (node)
    Preconditions: Worker implemented with concurrency: 3
    Steps:
      1. Add 5 jobs to analysisQueue
      2. Verify only 3 jobs process simultaneously
      3. Verify 4th and 5th jobs wait in queue
    Expected Result: Maximum 3 concurrent jobs
    Failure Indicators: More than 3 jobs processing simultaneously
    Evidence: .sisyphus/evidence/task-9-worker-concurrency.txt

  Scenario: Worker handles job failure gracefully
    Tool: Bash (node)
    Preconditions: Worker implemented with retry logic
    Steps:
      1. Add job that intentionally fails
      2. Verify job retries (max 2 attempts)
      3. Verify job status becomes FAILED after max retries
      4. Verify SSE event published with error details
    Expected Result: Failed jobs retry then transition to FAILED state
    Failure Indicators: Job retries indefinitely, no error event published
    Evidence: .sisyphus/evidence/task-9-worker-failure.txt
  ```

  **Evidence to Capture:**
  - [ ] task-9-worker-lifecycle.txt, task-9-worker-concurrency.txt, task-9-worker-failure.txt
  - [ ] Terminal output from jest

  **Commit**: YES (groups with T6, T7, T8)
  - Message: `feat(services): add GitHub client, LLM client, Redis cache, BullMQ worker`
  - Files: `workers/analysis-worker.ts`, `workers/index.ts`, `tests/workers/analysis-worker.test.ts`, `docker-compose.yml` (updated)
  - Pre-commit: `npx jest tests/workers/`

- [x] 10. Repository Analysis Pipeline

  **What to do**:
  - Implement `services/analysis/repo-analysis.ts` — core pipeline for analyzing a single repository
  - Pipeline steps per repo:
    1. Fetch repo metadata via GitHub client (T6)
    2. Fetch README (truncated to 10KB) via GitHub client
    3. Fetch commits (filtered via commit filter T3, max 300, authored only, no merges)
    4. Send to LLM client for repo analysis (T7) using prompt template (T4)
    5. Validate LLM output with RepositoryAnalysisSchema (T1)
    6. Cache LLM output in Redis (T8) — `llm:repo:{username}:{repo}` with 24h TTL
    7. Store result in `repository_analyses` table (via Prisma)
    8. Publish SSE event: `{ type: "repo_analysis_complete", repoName, status }` or `{ type: "repo_analysis_failed", repoName, error }`
  - Handle repo analysis failure: Mark as FAILED, continue to next repo (skip, not abort)
  - Handle empty repos after filtering: Skip with "insufficient meaningful commits" status
  - Handle README missing: Proceed without README content, note in analysis
  - Write RED tests first: test full pipeline with mocked GitHub/LLM/Redis, test failure handling, test filtering
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement profile aggregation (T11)
  - Do NOT implement job orchestration (T12)
  - Do NOT add API endpoints or SSE server

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core analysis pipeline — complex orchestration with error handling
  - **Skills**: [`fastapi`]
    - `fastapi`: Pipeline pattern expertise — data validation, error handling

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T3, T6, T7, T8 all complete)
  - **Parallel Group**: Wave 3
  - **Blocks**: T11, T12
  - **Blocked By**: T3 (commit filter), T6 (GitHub client), T7 (LLM client), T8 (Redis cache)

  **References**:
  - `lib/commit-filter.ts`: filterCommits functions (from T3)
  - `services/github-client.ts`: getUserRepositories, getRepositoryReadme, getRepositoryCommits (from T6)
  - `services/llm-client.ts`: analyzeRepository (from T7)
  - `services/cache.ts`: getCachedLLMOutput, setCachedLLMOutput (from T8)
  - `schemas/repository-analysis.ts`: RepositoryAnalysisSchema (from T1)
  - PRD Section 14 Step 1: Repository Analysis pipeline flow
  - PRD Sections 5.3-5.5: Repository and commit filtering rules

  **Acceptance Criteria**:
  - [ ] Test file: `tests/services/analysis/repo-analysis.test.ts`
  - [ ] `npx jest tests/services/analysis/repo-analysis.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: Repository analysis pipeline end-to-end
    Tool: Bash (node)
    Preconditions: All services mocked
    Steps:
      1. Input: { username: "torvalds", repoName: "linux" }
      2. Mock GitHub returns: metadata, README, 50 filtered commits
      3. Mock LLM returns: valid RepositoryAnalysis JSON
      4. Verify result stored in DB and cached in Redis
      5. Verify SSE event: repo_analysis_complete
    Expected Result: Full pipeline succeeds, data stored and cached
    Failure Indicators: Pipeline crashes, data not stored
    Evidence: .sisyphus/evidence/task-10-repo-pipeline.txt

  Scenario: Repository analysis handles failure gracefully
    Tool: Bash (node)
    Preconditions: Mocked services with failures
    Steps:
      1. Mock LLM malformed JSON → retry 2x → fails → mark repo FAILED
      2. Verify SSE event: repo_analysis_failed
      3. Verify pipeline continues to next repo
      4. Mock 404 README → proceed without README
      5. Mock all-filtered commits → skip with "insufficient commits"
    Expected Result: Failures handled, pipeline continues
    Failure Indicators: Pipeline aborts on failure
    Evidence: .sisyphus/evidence/task-10-repo-failure.txt
  ```

  **Commit**: YES (groups with T11, T12)
  - Message: `feat(pipeline): add repository analysis, profile aggregation, and job orchestrator`
  - Files: `services/analysis/repo-analysis.ts`, `tests/services/analysis/repo-analysis.test.ts`
  - Pre-commit: `npx jest tests/services/analysis/`

- [x] 11. Profile Aggregation Pipeline

  **What to do**:
  - Implement `services/analysis/profile-aggregation.ts` — synthesizes repo analyses into profile report
  - Pipeline steps:
    1. Collect all `repository_analyses` for a job (from DB)
    2. Filter to COMPLETED analyses only (skip FAILED)
    3. If 0 successful analyses → mark job as FAILED with "no eligible repositories"
    4. Send to LLM for aggregation (T7) using aggregation prompt (T4)
    5. Validate output with ProfileReportSchema (T1)
    6. If aggregation fails after 2 retries → store raw analyses with "aggregation_failed" status
    7. Cache in Redis (T8) — `llm:profile:{username}` with 24h TTL
    8. Store in `profile_reports` table
    9. Publish SSE event: aggregation_complete or aggregation_failed
  - Write RED tests first: test with multiple/singles/0 repo analyses, test aggregation failure
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement job orchestration (T12) or API endpoints or SSE server

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Aggregation pipeline — synthesis of LLM outputs with partial failure handling
  - **Skills**: [`fastapi`]

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T7, T8, T10)
  - **Parallel Group**: Wave 3
  - **Blocks**: T12
  - **Blocked By**: T7 (LLM client), T8 (Redis cache), T10 (repo analysis output)

  **References**:
  - `services/llm-client.ts`: aggregateProfile (from T7)
  - `services/cache.ts`: setCachedLLMOutput (from T8)
  - `schemas/profile-report.ts`: ProfileReportSchema (from T1)
  - `services/analysis/repo-analysis.ts`: Repository analysis output (from T10)
  - PRD Section 14 Step 2: Profile Aggregation flow
  - PRD Section 7: Role Estimation — Backend, Frontend, DevOps, ML, Lead, Maintainer, Architecture Contributor

  **Acceptance Criteria**:
  - [ ] Test file: `tests/services/analysis/profile-aggregation.test.ts`
  - [ ] `npx jest tests/services/analysis/profile-aggregation.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: Profile aggregation synthesizes repo analyses
    Tool: Bash (node)
    Preconditions: All services mocked
    Steps:
      1. Input: 5 completed repo analyses
      2. Mock LLM returns valid ProfileReport JSON
      3. Verify profile report stored in DB and cached in Redis
      4. Verify SSE event: aggregation_complete
    Expected Result: Aggregation succeeds, report stored
    Failure Indicators: Aggregation fails, data not stored
    Evidence: .sisyphus/evidence/task-11-aggregation-pipeline.txt

  Scenario: Aggregation handles 0 successful repos and LLM failure
    Tool: Bash (node)
    Preconditions: Mocked services with edge cases
    Steps:
      1. 0 successful analyses → FAILED with "no eligible repositories"
      2. LLM malformed after 2 retries → aggregation_failed, raw analyses preserved
    Expected Result: Edge cases handled, partial data preserved
    Failure Indicators: Pipeline crashes on edge cases
    Evidence: .sisyphus/evidence/task-11-aggregation-failure.txt
  ```

  **Commit**: YES (groups with T10, T12)
  - Message: `feat(pipeline): add repository analysis, profile aggregation, and job orchestrator`
  - Files: `services/analysis/profile-aggregation.ts`, `tests/services/analysis/profile-aggregation.test.ts`
  - Pre-commit: `npx jest tests/services/analysis/`

- [x] 12. Analysis Job Orchestrator

  **What to do**:
  - Implement `services/analysis/orchestrator.ts` — main orchestration tying repo analysis and aggregation together
  - Flow:
    1. Receive BullMQ job: `{ username, githubUrl }`
    2. Check for duplicate active job via Redis (T9) — return existing jobId if found
    3. Create `analysis_jobs` record: status PENDING
    4. Update status → PROCESSING
    5. Fetch user repos via GitHub client (T6) — filter fork/archived/empty (PRD 5.3)
    6. If 0 eligible repos → FAILED with "no eligible repositories"
    7. Process repos with concurrency 3 (BullMQ handles this, T9)
    8. For each repo: run repo analysis pipeline (T10)
    9. After all repos: run profile aggregation (T11)
    10. Update status → COMPLETED
    11. On unhandled error: status → FAILED with error message
    12. Publish SSE: job_complete or job_failed
  - 10-minute overall timeout via BullMQ job timeout
  - Connect orchestrator to BullMQ worker (T9)
  - Write RED tests first: test full orchestration, duplicate job handling, 0 eligible repos, timeout
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT add API endpoints (T13) or SSE server (T14) or UI components

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Main orchestration — complex flow control, error handling, timeout, dedup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T9, T10, T11 all complete)
  - **Parallel Group**: Wave 3
  - **Blocks**: T13, T14
  - **Blocked By**: T9 (BullMQ worker), T10 (repo analysis), T11 (profile aggregation)

  **References**:
  - `workers/analysis-worker.ts`: BullMQ worker setup (from T9)
  - `services/analysis/repo-analysis.ts`: analyzeRepository (from T10)
  - `services/analysis/profile-aggregation.ts`: aggregateProfile (from T11)
  - `services/github-client.ts`: getUserRepositories (from T6)
  - `services/cache.ts`: getCachedAnalysis (from T8)
  - `lib/constants.ts`: MAX_REPOS, ANALYSIS_TIMEOUT_MS (from T5)
  - PRD Section 11: Background Job Architecture
  - PRD Section 19: Limits — max 50 repos, concurrent 3, timeout 10min

  **Acceptance Criteria**:
  - [ ] Test file: `tests/services/analysis/orchestrator.test.ts`
  - [ ] `npx jest tests/services/analysis/orchestrator.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: Full orchestration end-to-end
    Tool: Bash (node)
    Preconditions: All services mocked
    Steps:
      1. Input: { username: "torvalds", githubUrl: "https://github.com/torvalds" }
      2. Mock GitHub: 10 repos (3 fork, 7 eligible)
      3. Verify status: PENDING → PROCESSING → COMPLETED
      4. Verify repo analyses with concurrency 3
      5. Verify aggregation runs after all repos
      6. Verify SSE: job_complete
    Expected Result: Full pipeline succeeds, profile report generated
    Failure Indicators: Job stuck, aggregation skipped
    Evidence: .sisyphus/evidence/task-12-orchestrator-e2e.txt

  Scenario: Duplicate job and timeout handling
    Tool: Bash (node)
    Preconditions: Mocked services
    Steps:
      1. Submit duplicate job → returns existing jobId, "in progress"
      2. Mock slow GitHub (>10min) → job FAILED with timeout
    Expected Result: Dedup works, timeout handled cleanly
    Failure Indicators: Duplicate jobs, timeout hang
    Evidence: .sisyphus/evidence/task-12-orchestrator-dedup-timeout.txt
  ```

  **Commit**: YES (groups with T10, T11)
  - Message: `feat(pipeline): add repository analysis, profile aggregation, and job orchestrator`
  - Files: `services/analysis/orchestrator.ts`, `tests/services/analysis/orchestrator.test.ts`
  - Pre-commit: `npx jest tests/services/analysis/`

- [x] 13. API Endpoints

  **What to do**:
  - Implement Next.js App Router Route Handlers:
    - `POST /api/analyze` — accepts `{ url: string }`, validates GitHub URL, checks cache/duplicate, creates analysis job, returns `{ jobId: string, status: string }`
    - `GET /api/report/[jobId]` — returns completed profile report JSON, returns 404 if not found, returns processing status if still running
    - `GET /api/report/[jobId]/pdf` — triggers PDF generation (delegated to T18), returns PDF binary when ready
  - Input validation in `POST /api/analyze`:
    - Validate URL format using `normalizeGitHubUrl` from T5
    - Check URL against regex `^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$` for username extraction
    - Return 400 for invalid URL
    - Return 404 for nonexistent GitHub profile
    - Check for duplicate active job — return existing jobId with 200 if found
  - All external API calls must have timeouts (per PRD Section 21)
  - Error boundary applied per PRD Section 21
  - Write RED tests first: test all endpoints with mocked services, test validation, test error responses
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT implement SSE endpoint (T14)
  - Do NOT implement UI components (T15, T16, T17)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: API endpoints with validation, error handling, caching — non-trivial but well-defined
  - **Skills**: [`fastapi`]
    - `fastapi`: API endpoint patterns, validation, error handling expertise

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T12)
  - **Parallel Group**: Wave 4 (with T14, T15, T16)
  - **Blocks**: T17, T18, T19
  - **Blocked By**: T12 (orchestrator)

  **References**:
  - `services/analysis/orchestrator.ts`: startAnalysis function (from T12)
  - `services/cache.ts`: getCachedAnalysis (from T8)
  - `lib/utils.ts`: normalizeGitHubUrl, hashUrl (from T5)
  - `lib/errors.ts`: ValidationError, GitHubAPIError (from T5)
  - PRD Section 5.1: GitHub Profile URL input format
  - PRD Section 17: Error handling — invalid URL, rate limit, fetch failure, etc.
  - PRD Section 19: Security limits — max 50 repos, max 300 commits, timeout

  **Acceptance Criteria**:
  - [ ] Test file: `tests/api/analyze.test.ts`, `tests/api/report.test.ts`
  - [ ] `npx jest tests/api/` → PASS

  **QA Scenarios**:
  ```
  Scenario: POST /api/analyze creates job for valid GitHub URL
    Tool: Bash (curl)
    Preconditions: Server running, services mocked
    Steps:
      1. `curl -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -d '{"url": "https://github.com/torvalds"}'`
      2. Verify response: 202 with `{ jobId: "...", status: "PENDING" }`
    Expected Result: Job created, 202 response with jobId
    Failure Indicators: 500 error, missing jobId
    Evidence: .sisyphus/evidence/task-13-api-analyze.txt

  Scenario: POST /api/analyze rejects invalid URL
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. `curl -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -d '{"url": "not-a-url"}'`
      2. Verify response: 400 with error message
      3. `curl -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -d '{"url": "https://github.com/nonexistent-user-xyz-12345"}'`
      4. Verify response: 404 with "GitHub profile not found"
    Expected Result: Invalid URLs return 400, nonexistent profiles return 404
    Failure Indicators: 500 error, accepts invalid URL
    Evidence: .sisyphus/evidence/task-13-api-validation.txt

  Scenario: GET /api/report/[jobId] returns completed report
    Tool: Bash (curl)
    Preconditions: Completed job in DB
    Steps:
      1. `curl http://localhost:3000/api/report/{completedJobId}`
      2. Verify response: 200 with profile report JSON
      3. `curl http://localhost:3000/api/report/{processingJobId}`
      4. Verify response: 202 with `{ status: "PROCESSING" }`
      5. `curl http://localhost:3000/api/report/{nonexistentJobId}`
      6. Verify response: 404
    Expected Result: Completed reports return 200, processing returns 202, not found returns 404
    Failure Indicators: Wrong status codes, missing fields
    Evidence: .sisyphus/evidence/task-13-api-report.txt
  ```

  **Commit**: YES (groups with T14)
  - Message: `feat(api): add REST endpoints and SSE`
  - Files: `app/api/analyze/route.ts`, `app/api/report/[jobId]/route.ts`, `app/api/report/[jobId]/pdf/route.ts`, `tests/api/`
  - Pre-commit: `npx jest tests/api/`

- [x] 14. SSE Endpoint

  **What to do**:
  - Implement `GET /api/analysis/[jobId]/events` as a Next.js Route Handler with SSE
  - SSE event flow:
    1. Client connects to `/api/analysis/{jobId}/events`
    2. Server immediately sends current job status as first event (reconnection support per Metis)
    3. Server subscribes to Redis pub/sub channel `analysis:{jobId}:events`
    4. Forward events from worker: `repo_analysis_complete`, `repo_analysis_failed`, `aggregation_complete`, `aggregation_failed`, `job_complete`, `job_failed`
    5. On job completion or failure, send final event and close connection
    6. On client disconnect, unsubscribe from pub/sub
  - SSE implementation:
    - Use `ReadableStream` with `TextEncoder` for streaming response
    - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
    - Heartbeat: Send `: heartbeat\n\n` every 30 seconds to keep connection alive
    - Reconnection: Client can resume by sending `Last-Event-ID` header (event IDs are sequential)
  - Write RED tests first: test SSE connection, test event flow, test reconnection
  - Implement to make tests pass

  **Must NOT do**:
  - Do NOT use WebSocket — SSE only (guardrail)
  - Do NOT implement polling — SSE is the real-time mechanism

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: SSE implementation with Redis pub/sub, reconnection — requires careful stream handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Parallel Group**: Wave 4 (with T13, T15, T16)
  - **Blocks**: T16
  - **Blocked By**: T9 (BullMQ worker publishes events), T12 (orchestrator publishes events)

  **References**:
  - `workers/analysis-worker.ts`: Redis pub/sub channel names (from T9)
  - `services/analysis/orchestrator.ts`: SSE event publishing (from T12)
  - PRD Section 11: Background Job Architecture — polling flow
  - Next.js SSE via Route Handler: https://nextjs.org/docs/app/building-your-application/routing/route-handlers#streaming

  **Acceptance Criteria**:
  - [ ] Test file: `tests/api/sse.test.ts`
  - [ ] `npx jest tests/api/sse.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: SSE streams real-time analysis progress
    Tool: Bash (curl)
    Preconditions: Analysis job in progress
    Steps:
      1. `curl -N http://localhost:3000/api/analysis/{jobId}/events`
      2. Verify first event is current job status
      3. Verify subsequent events: repo_analysis_complete events
      4. Verify final event: job_complete
      5. Verify connection closes after final event
    Expected Result: SSE streams events in real-time, connection closes on completion
    Failure Indicators: Events not streaming, connection stays open forever
    Evidence: .sisyphus/evidence/task-14-sse-stream.txt

  Scenario: SSE handles reconnection
    Tool: Bash (curl)
    Preconditions: Completed analysis job
    Steps:
      1. Connect to SSE endpoint → receive current status immediately
      2. Verify heartbeat sent every 30 seconds
    Expected Result: Immediate status on connect, heartbeats sent
    Failure Indicators: No status on connect, no heartbeats
    Evidence: .sisyphus/evidence/task-14-sse-reconnect.txt
  ```

  **Commit**: YES (groups with T13)
  - Message: `feat(api): add REST endpoints and SSE`
  - Files: `app/api/analysis/[jobId]/events/route.ts`, `tests/api/sse.test.ts`
  - Pre-commit: `npx jest tests/api/`

- [x] 15. Landing Page + URL Input Component

  **What to do**:
  - Implement landing page at `app/page.tsx` with Next.js App Router
  - Page layout:
    - Hero section: "GitHub Profile Analyzer" title, description
    - Input section: GitHub URL text input with submit button
    - Recent analyses section (optional — show cached results)
  - URL input component `components/UrlInput.tsx`:
    - Text input for GitHub profile URL
    - Client-side validation: URL format check, extract username
    - Submit triggers `POST /api/analyze`
    - Loading state while submitting
    - Error display for: invalid URL, profile not found, server error
    - On success: redirect to `/analysis/{jobId}`
  - TailwindCSS styling: clean, modern, responsive design
  - Write component tests (if using React Testing Library)
  - Implement component

  **Must NOT do**:
  - Do NOT implement analysis progress page (T16)
  - Do NOT implement report display (T17)
  - Do NOT add data visualizations — text only (guardrail)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with design requirements
  - **Skills**: [`frontend-design`]
    - `frontend-design`: Distinctive, production-grade UI design

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 4)
  - **Parallel Group**: Wave 4 (with T13, T14, T16)
  - **Blocks**: T16
  - **Blocked By**: T2 (skeleton)

  **References**:
  - PRD Section 4: User Flow — Landing Page → GitHub Profile URL 입력 → Analysis Job 생성
  - `app/` directory structure from T2

  **Acceptance Criteria**:
  - [ ] Landing page renders at `/`
  - [ ] URL input accepts and validates GitHub URLs
  - [ ] Submit triggers POST /api/analyze

  **QA Scenarios**:
  ```
  Scenario: Landing page renders with URL input
    Tool: Playwright
    Preconditions: Server running on localhost:3000
    Steps:
      1. Navigate to http://localhost:3000
      2. Verify "GitHub Profile Analyzer" heading present
      3. Verify URL input field visible
      4. Verify submit button visible
    Expected Result: Landing page fully renders with input
    Failure Indicators: Page blank, missing elements
    Evidence: .sisyphus/evidence/task-15-landing-page.png

  Scenario: URL input validates and submits
    Tool: Playwright
    Preconditions: Server running
    Steps:
      1. Type "https://github.com/torvalds" in input
      2. Click submit
      3. Verify loading state appears
      4. Verify redirect to `/analysis/{jobId}`
    Expected Result: URL validated, job submitted, redirect happens
    Failure Indicators: No validation, no loading state, no redirect
    Evidence: .sisyphus/evidence/task-15-url-input.png

  Scenario: Invalid URL shows error
    Tool: Playwright
    Preconditions: Server running
    Steps:
      1. Type "not-a-url" in input
      2. Click submit
      3. Verify error message displayed
    Expected Result: Clear error message for invalid URL
    Failure Indicators: No error displayed, generic error
    Evidence: .sisyphus/evidence/task-15-invalid-url.png
  ```

  **Commit**: YES (groups with T16)
  - Message: `feat(ui): add landing page and URL input`
  - Files: `app/page.tsx`, `components/UrlInput.tsx`, `app/layout.tsx`
  - Pre-commit: `npx next build`

- [x] 16. Analysis Progress Page

  **What to do**:
  - Implement analysis progress page at `app/analysis/[jobId]/page.tsx`
  - Page shows real-time analysis progress via SSE:
    - Listen to SSE endpoint `/api/analysis/{jobId}/events`
    - Display current status: PENDING → PROCESSING → COMPLETED | FAILED
    - Show progress: "Analyzing repository 3/7..." with repo names
    - Display completed repository analyses as they arrive (progressive rendering)
    - Show failed repos with error messages
    - On job_complete: redirect to report page `/report/{jobId}`
    - On job_failed: show error message with retry option
  - SSE client connection using `EventSource` API
  - React Query for initial data fetch (`GET /api/report/{jobId}` for reconnection)
  - Handle SSE disconnection: auto-reconnect, show current status on reconnect
  - TailwindCSS styling: progress cards with animated indicators
  - Implement page

  **Must NOT do**:
  - Do NOT implement report display page (T17)
  - Do NOT add data visualizations (guardrail)
  - Do NOT use WebSocket

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Real-time progress UI with SSE integration — design + engineering
  - **Skills**: [`frontend-design`]
    - `frontend-design`: Distinctive, production-grade UI design

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T14 SSE endpoint and T15 landing page)
  - **Parallel Group**: Wave 4
  - **Blocks**: None directly
  - **Blocked By**: T14 (SSE endpoint), T15 (landing page component patterns)

  **References**:
  - `app/api/analysis/[jobId]/events/route.ts`: SSE endpoint (from T14)
  - PRD Section 4: User Flow — Analysis Job 생성 → polling flow → Report 생성
  - PRD Section 11: Background Job Architecture — polling status flow

  **Acceptance Criteria**:
  - [ ] Progress page renders at `/analysis/[jobId]`
  - [ ] SSE connection established and events displayed
  - [ ] Progressive rendering of completed repo analyses

  **QA Scenarios**:
  ```
  Scenario: Analysis progress page shows real-time updates
    Tool: Playwright
    Preconditions: Analysis job in progress, SSE endpoint working
    Steps:
      1. Navigate to http://localhost:3000/analysis/{jobId}
      2. Verify "Processing" status displayed
      3. Wait for repo_analysis_complete events
      4. Verify completed repos appear progressively
      5. Wait for job_complete event
      6. Verify redirect to /report/{jobId}
    Expected Result: Real-time progress, progressive repo display, auto-redirect
    Failure Indicators: No SSE updates, stuck on "Processing", no redirect
    Evidence: .sisyphus/evidence/task-16-progress-page.png

  Scenario: Analysis progress handles failure
    Tool: Playwright
    Preconditions: Analysis job that will fail
    Steps:
      1. Navigate to progress page
      2. Wait for job_failed event
      3. Verify error message displayed
      4. Verify retry option visible
    Expected Result: Clear error display with retry option
    Failure Indicators: No error shown, no retry option
    Evidence: .sisyphus/evidence/task-16-progress-failure.png
  ```

  **Commit**: YES (groups with T15)
  - Message: `feat(ui): add landing page and analysis progress page`
  - Files: `app/analysis/[jobId]/page.tsx`, `components/AnalysisProgress.tsx`, `components/RepoAnalysisCard.tsx`
  - Pre-commit: `npx next build`

- [x] 17. Report Display Page

  **What to do**:
  - Implement report display page at `app/report/[jobId]/page.tsx`
  - Page displays completed ProfileReport in structured format matching PRD Section 6:
    1. Overall Summary
    2. Tech Stack Analysis
    3. Main Contribution Areas
    4. Repository Breakdown (expandable cards for each repo)
    5. Estimated Roles (with confidence scores)
    6. Engineering Strengths
    7. Collaboration Patterns
  - Fetch report data via `GET /api/report/{jobId}`
  - React Query for data fetching with loading/error states
  - TailwindCSS styling: clean, professional report layout
  - Responsive design: works on desktop and mobile
  - "Export PDF" button that triggers `GET /api/report/{jobId}/pdf`
  - Implement page

  **Must NOT do**:
  - Do NOT add data visualizations (charts, graphs) — text only (guardrail)
  - Do NOT implement PDF generation logic (T18)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Report UI with structured data display — design + engineering
  - **Skills**: [`frontend-design`]
    - `frontend-design`: Professional, clean report layout

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 5, with T18, T19)
  - **Parallel Group**: Wave 5
  - **Blocks**: T18
  - **Blocked By**: T13 (API endpoints)

  **References**:
  - `app/api/report/[jobId]/route.ts`: API endpoint (from T13)
  - `schemas/profile-report.ts`: ProfileReportSchema — defines data shape (from T1)
  - PRD Section 6: Report Structure — 7 sections listed
  - PRD Section 7: Role Estimation — roles to display

  **Acceptance Criteria**:
  - [ ] Report page renders at `/report/{jobId}`
  - [ ] All 7 report sections displayed
  - [ ] PDF export button present

  **QA Scenarios**:
  ```
  Scenario: Report page displays all sections
    Tool: Playwright
    Preconditions: Completed analysis job in DB
    Steps:
      1. Navigate to http://localhost:3000/report/{completedJobId}
      2. Verify "Overall Summary" section visible
      3. Verify "Tech Stack Analysis" section visible
      4. Verify "Main Contribution Areas" section visible
      5. Verify "Repository Breakdown" section with expandable cards
      6. Verify "Estimated Roles" section with confidence scores
      7. Verify "Engineering Strengths" section visible
      8. Verify "Collaboration Patterns" section visible
      9. Verify "Export PDF" button visible
    Expected Result: All 7 sections rendered, PDF button present
    Failure Indicators: Missing sections, broken layout
    Evidence: .sisyphus/evidence/task-17-report-page.png

  Scenario: Report page handles loading and error states
    Tool: Playwright
    Preconditions: Mock API states
    Steps:
      1. Navigate to report page while job is processing → loading state
      2. Navigate to report page with failed job → error state with message
      3. Navigate to report page with nonexistent job ID → 404
    Expected Result: Loading spinner, error message, 404 page respectively
    Failure Indicators: Blank page, unhelpful error
    Evidence: .sisyphus/evidence/task-17-report-states.png
  ```

  **Commit**: YES (groups with T18, T19)
  - Message: `feat(report): add report display, PDF export, and error pages`
  - Files: `app/report/[jobId]/page.tsx`, `components/ReportSection.tsx`, `components/RepoBreakdown.tsx`, `components/RoleEstimation.tsx`
  - Pre-commit: `npx next build`

- [x] 18. PDF Export via Playwright

  **What to do**:
  - Implement PDF generation service in `services/pdf-export.ts`
  - Use Playwright to render report HTML and generate PDF:
    1. Create a dedicated PDF template page at `app/report/[jobId]/pdf-template/page.tsx` — server-rendered, print-optimized layout
    2. Use Playwright to open the template page, wait for render, and call `page.pdf()` with appropriate options
    3. Store PDF in `pdf_exports` table (via Prisma): file path + report ID
    4. Return PDF binary via `GET /api/report/[jobId]/pdf`
  - Playwright Docker setup:
    - Use `mcr.microsoft.com/playwright` base image for the worker container
    - Or install Playwright browsers in the next-app container with multi-stage build
    - Add `PLAYWRIGHT_BROWSERS_PATH` environment variable
  - PDF options: A4 size, print background, margin 10mm, format: Letter
  - Include all report sections in PDF (Overall Summary, Tech Stack, etc.)
  - PDF generation should run as a BullMQ job (not in request context — guardrail)
  - Write tests: mock Playwright, test PDF template rendering, test PDF generation
  - Implement

  **Must NOT do**:
  - Do NOT generate PDF in request context — must be BullMQ job (guardrail)
  - Do NOT use Puppeteer — use Playwright only
  - Do NOT add charts/visualizations to PDF — text only (guardrail)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Playwright integration, Docker setup, PDF generation — complex and requires careful configuration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 5, with T17, T19)
  - **Parallel Group**: Wave 5
  - **Blocks**: None directly
  - **Blocked By**: T13 (API endpoint for PDF), T17 (report page template)

  **References**:
  - PRD Section 20: PDF Export — HTML rendering → PDF, Puppeteer recommended (we use Playwright)
  - PRD Section 20: PDF content — overall summary, repository breakdown, role analysis, strengths
  - `mcr.microsoft.com/playwright` Docker image

  **External References**:
  - Playwright PDF generation: https://playwright.dev/docs/api/class-page#page-pdf
  - Playwright Docker: https://playwright.dev/docs/docker

  **Acceptance Criteria**:
  - [ ] Test file: `tests/services/pdf-export.test.ts`
  - [ ] `npx jest tests/services/pdf-export.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: PDF generation produces valid PDF file
    Tool: Bash (curl + file)
    Preconditions: Completed analysis job, Playwright installed
    Steps:
      1. Trigger PDF generation via API
      2. `curl http://localhost:3000/api/report/{completedJobId}/pdf -o report.pdf`
      3. Verify `file report.pdf` shows "PDF document"
      4. Verify PDF contains "Overall Summary" text
      5. Verify PDF contains "Estimated Roles" text
    Expected Result: Valid PDF with report content
    Failure Indicators: Empty file, corrupt PDF, missing sections
    Evidence: .sisyphus/evidence/task-18-pdf-generation.pdf

  Scenario: PDF generation handles failure gracefully
    Tool: Bash (curl)
    Preconditions: Mock Playwright failure
    Steps:
      1. Trigger PDF generation for a report
      2. Mock Playwright crash scenario
      3. Verify error response returned to client
    Expected Result: Clear error message, no hang
    Failure Indicators: Server crash, indefinite hang
    Evidence: .sisyphus/evidence/task-18-pdf-failure.txt
  ```

  **Commit**: YES (groups with T17, T19)
  - Message: `feat(report): add report display, PDF export, and error pages`
  - Files: `services/pdf-export.ts`, `app/report/[jobId]/pdf-template/page.tsx`, `workers/pdf-worker.ts` (if separate), `Dockerfile` (updated for Playwright), `tests/services/pdf-export.test.ts`
  - Pre-commit: `npx jest tests/services/pdf-export.test.ts`

- [x] 19. Error Handling + Edge Case Pages

  **What to do**:
  - Implement error pages and edge case handling:
    - `app/not-found.tsx` — Custom 404 page
    - `app/error.tsx` — Custom error boundary page
    - `app/analysis/[jobId]/error.tsx` — Analysis-specific error page (job not found, job failed)
    - Error handling in API endpoints for all PRD Section 17 errors:
      - Invalid GitHub URL → 400 with clear message
      - GitHub rate limit → 429 with retry-after header
      - Repository fetch failure → 502 with message
      - README missing → proceed without README
      - Empty repository → skip with message
      - Gemini API failure → 502 with message
      - Malformed LLM output → retry (per Section 15)
      - Timeout → 504 with message
    - Global error boundary for unexpected errors
  - Input validation in `POST /api/analyze`:
    - GitHub URL format validation
    - Repository count upper bound (50)
    - Analysis timeout (10 minutes)
    - Invalid characters in URL
  - Write tests for all error responses
  - Implement

  **Must NOT do**:
  - Do NOT add authentication or OAuth (guardrail)
  - Do NOT add WebSocket error handling (SSE only)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Error handling across multiple pages and APIs — comprehensive but well-defined
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (within Wave 5, with T17, T18)
  - **Parallel Group**: Wave 5
  - **Blocks**: None directly
  - **Blocked By**: T13 (API endpoints to add error handling to)

  **References**:
  - PRD Section 17: Error Handling Rules — all 8 error types listed
  - PRD Section 19: Security Constraints — input validation limits
  - PRD Section 18: Retry Policy — GitHub 3x, Gemini 2x
  - `app/api/analyze/route.ts`: API endpoint (from T13)
  - `lib/errors.ts`: Custom error classes (from T5)

  **Acceptance Criteria**:
  - [ ] Test files: `tests/api/error-handling.test.ts`, `tests/ui/error-pages.test.ts`
  - [ ] `npx jest tests/api/error-handling.test.ts tests/ui/error-pages.test.ts` → PASS

  **QA Scenarios**:
  ```
  Scenario: API returns correct error for invalid GitHub URL
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. `curl -X POST http://localhost:3000/api/analyze -d '{"url": "not-a-url"}'` → 400
      2. `curl -X POST http://localhost:3000/api/analyze -d '{"url": "https://github.com/nonexistent-xyz-12345"}'` → 404
      3. `curl http://localhost:3000/api/report/nonexistent-job-id` → 404
    Expected Result: Correct HTTP status codes with clear error messages
    Failure Indicators: Wrong status codes, generic error messages
    Evidence: .sisyphus/evidence/task-19-error-handling.txt

  Scenario: UI error pages render correctly
    Tool: Playwright
    Preconditions: Server running
    Steps:
      1. Navigate to http://localhost:3000/nonexistent → custom 404 page
      2. Navigate to http://localhost:3000/analysis/nonexistent-id → error page
      3. Verify error messages are clear and helpful
    Expected Result: Custom error pages with clear messages
    Failure Indicators: Default Next.js error page, unclear messages
    Evidence: .sisyphus/evidence/task-19-error-pages.png
  ```

  **Commit**: YES (groups with T17, T18)
  - Message: `feat(report): add report display, PDF export, and error pages`
  - Files: `app/not-found.tsx`, `app/error.tsx`, `app/analysis/[jobId]/error.tsx`, `tests/api/error-handling.test.ts`, `tests/ui/error-pages.test.ts`
  - Pre-commit: `npx jest tests/api/error-handling.test.ts tests/ui/error-pages.test.ts`

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, curl endpoint, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [12/12] | Must NOT Have [10/10] | Tasks [19/19] | VERDICT: APPROVE`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `tsc --noEmit` + linter + `npx jest`. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp).
  Output: `Build [PASS] | Lint [PASS] | Tests [232/232 pass] | Files [clean] | VERDICT: APPROVE`

- [x] F3. **Real Manual QA** — `unspecified-high` (+ `playwright` skill)
  Start from clean state (docker compose up). Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration (features working together, not isolation). Test edge cases: nonexistent GitHub profile, 0 eligible repos, all-fork profile, invalid URL. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [all pass] | Integration [verified] | Edge Cases [tested] | VERDICT: APPROVE`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT do" compliance. Detect cross-task contamination: Task N touching Task M's files. Flag unaccounted changes.
  Output: `Tasks [19/19 compliant] | Contamination [CLEAN] | Unaccounted [CLEAN] | VERDICT: APPROVE`

---

## Commit Strategy

- **Wave 1**: `feat(scaffold): initial project setup with Next.js, Prisma, Docker` - T1-T5 files
- **Wave 2**: `feat(services): GitHub client, LLM client, Redis cache, BullMQ worker` - T6-T9 files
- **Wave 3**: `feat(pipeline): analysis pipeline with repo analysis and aggregation` - T10-T12 files
- **Wave 4**: `feat(api): REST endpoints, SSE, and UI pages` - T13-T16 files
- **Wave 5**: `feat(report): report display and PDF export` - T17-T19 files

---

## Success Criteria

### Verification Commands
```bash
docker compose up -d                          # Expected: 4 containers running
curl -X POST http://localhost:3000/api/analyze -H "Content-Type: application/json" -d '{"url": "https://github.com/torvalds"}'  # Expected: 202 + jobId
curl http://localhost:3000/api/analysis/{jobId}/events  # Expected: SSE stream
curl http://localhost:3000/api/report/{jobId}  # Expected: 200 + report JSON
curl http://localhost:3000/api/report/{jobId}/pdf  # Expected: 200 + PDF binary
npx jest                                       # Expected: all tests pass
```

### Final Checklist
- [x] All "Must Have" present
- [x] All "Must NOT Have" absent
- [x] All tests pass