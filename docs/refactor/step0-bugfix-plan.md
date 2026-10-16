# 0단계: 현 로직 단순 버그 수정 계획

리팩터링 순서(0 → 6) 중 0단계 작업 목록이다. 구조는 그대로 두고 동작이 틀린 부분만 고친다.
줄 번호는 `fix/simple-bugs` 브랜치의 커밋 `6d19a4b` 기준이다.

## 전체 리팩터링 순서 (참고)

0. 현 로직의 단순 버그 수정 ← 이 문서
1. 요구사항 분석 (사용자가 작성)
2. 요구사항 기준으로 도메인을 나누고 도메인별 규칙 수립
3. 필요한 DB 테이블·필드 추가
4. Gemini API → OpenAI 호환 endpoint로 전환
5. SSE 제거, 상태 조회 API + polling 도입 (Redis와 BullMQ는 큐 용도로 유지)
6. 수동 재시도 옵션 제공

## 진행 상태

- 브랜치: `fix/simple-bugs` (main에서 분기, push 안 함)
- 커밋 규칙: 작업 하나당 커밋 하나. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 확인 기준: 커밋마다 `npx jest` 실행. 기준선은 API 테스트 28개 통과, `tests/api/sse.test.ts` 3개 실패(기존 실패, 5단계에서 SSE와 함께 삭제 예정). 이보다 나빠지면 안 된다.

| # | 작업 | 상태 |
|---|---|---|
| — | 사용자 변경 정리(파일 삭제, orchestrator 주석) | 완료 `538c286` |
| 0-1 | API 요청 body 검증을 Zod로 변경 | 완료 `6d19a4b` |
| 0-2 | `jest-util` devDependency 추가 | 완료 |
| 0-3 | Queue / Worker 분리 | 완료 |
| 0-4 | BullMQ 재시도 비활성화, 재시도 불가 오류 처리 | 완료 |
| 0-5 | 실패 시 실패 화면이 뜨도록 수정 | 완료 |
| 0-6 | 중복 요청 방지의 경쟁 조건 수정 | 완료 `6baa878` |
| 0-7 | 지어낸 대체 리포트 제거 | 완료 `3bff387` |
| 0-8 | 커밋 필터 정규식 수정 | 완료 `bf1b70b` |
| 0-9 | 타임아웃 타이머 해제 | 완료 `ae6befd` |
| 0-10 | 리포트 페이지의 이중 단언과 죽은 섹션 제거 | 완료 (브라우저 확인은 못 함) |

## 결정된 사항

- 사용자 변경은 별도 커밋으로 먼저 분리했다.
- 0-10의 "기술 스택", "주요 기여 영역" 섹션은 **제거**한다. 필요하면 2~3단계에서 요구사항으로 다시 넣는다.
- 새 브랜치 `fix/simple-bugs`에 커밋한다. main 머지는 사용자가 직접 한다.

---

## 0-2. `jest-util` devDependency 추가

- **문제**: `ts-jest`가 peer dependency인 `jest-util`을 필요로 하지만 `package.json`에 없다. `npm ci`만 하면 모든 테스트가 `Cannot find module 'jest-util'`로 실행되지 않는다.
- **수정**: `npm install --save-dev jest-util@^29.7.0` (jest 29.7.0과 버전을 맞춘다).
- **확인**: `npm ci` 후 `npx jest`가 실행되고 기준선과 같은지 본다.
- **비고**: 이전 시도에서 사용자가 이 명령 실행을 중단했다. 다시 진행하기 전에 방식을 확인할 것.

## 0-3. Queue / Worker 분리

- **문제**: [workers/analysis-worker.ts:71](../../workers/analysis-worker.ts)가 모듈 최상단에서 `new Worker(...)`를 만든다. 큐만 쓰려고 이 모듈을 import하는 next-app도 Worker를 생성해 분석 작업을 꺼내 실행한다. 동시 처리 수가 프로세스마다 3개씩 늘어난다.
- **이 모듈을 import하는 곳**:
  - `app/api/analyze/route.ts:13` (`analysisQueue`)
  - `app/api/analysis/[jobId]/events/route.ts:6` (`getJobState`, `getEventChannel`)
  - `services/analysis/orchestrator.ts:15` (`publishEvent`)
  - `services/analysis/repo-analysis.ts:113`, `services/analysis/profile-aggregation.ts:42` (동적 import, `publishEvent`)
- **수정**: `Queue`, `publishEvent`, `getEventChannel`, `updateJobState`, `getJobState`, 타입, Redis 연결을 `lib/queue.ts`(이름은 자유)로 옮긴다. `new Worker`는 `workers/index.ts`(또는 worker 전용 파일)에서만 만든다. 위 import 5곳을 새 모듈로 바꾼다. `tsconfig.worker.json`의 include에 `lib/**`가 이미 있으므로 worker 빌드는 그대로 된다.
- **확인**: next-app 쪽 코드 경로(`app/**`)에서 `new Worker`에 도달하지 않는지 확인. `tests/workers/analysis-worker.test.ts`의 mock 경로를 함께 수정.

## 0-4. BullMQ 재시도 비활성화, 재시도 불가 오류 처리

- **문제**: [workers/analysis-worker.ts:23](../../workers/analysis-worker.ts)의 `attempts: 2` 때문에 실패한 파이프라인이 같은 jobId로 처음부터 다시 실행된다. 1차 시도의 `repositories`·`repository_analyses` 행이 남아 중복되고, `profile_reports.create`([orchestrator.ts:277](../../services/analysis/orchestrator.ts))는 `analysis_job_id` unique 제약에 걸린다. 1차 실패 때 이미 FAILED를 기록·발행했으므로 2차 성공은 화면에 전달되지 않는다.
- **수정**:
  - `attempts: 1`로 바꾸고 `backoff` 설정을 지운다. GitHub·Gemini 호출에는 이미 각자 재시도가 있다. 저장소 단위 재시도는 5~6단계에서 다룬다.
  - pinned 저장소 0개([orchestrator.ts:105-121](../../services/analysis/orchestrator.ts)): 안쪽에서 하는 FAILED 기록, 키 해제, 이벤트 발행을 지우고 오류만 던진다. 바깥 catch([orchestrator.ts:334](../../services/analysis/orchestrator.ts))가 한 번만 처리하게 한다. 입력 오류이므로 BullMQ `UnrecoverableError`를 써도 된다(attempts 1이면 선택 사항).
- **확인**: orchestrator 테스트에서 pinned 0개일 때 `analysis_jobs.update`(FAILED)가 한 번만 호출되는지 확인.

## 0-5. 실패 시 실패 화면이 뜨도록 수정

- **문제**: 진행 화면은 [page.tsx:187](../../app/analysis/[jobId]/page.tsx)의 `status === "FAILED" && error`일 때만 실패 화면을 보여준다. `error`는 `job_failed` 이벤트에서만 채워지는데, 서버 어디에서도 `job_failed`를 발행하지 않는다. 실패하면 화면이 "저장소 분석 중..."에 멈춘다. SSE 라우트도 `job_failed`가 오지 않아 연결을 닫지 않는다.
- **수정**:
  - 서버: orchestrator 바깥 catch([orchestrator.ts:334](../../services/analysis/orchestrator.ts))에서 기존 `stateChange` 발행 뒤에 `{ type: 'job_failed', state: 'FAILED', jobId, error }`를 발행한다.
  - 클라이언트: [page.tsx:78](../../app/analysis/[jobId]/page.tsx)의 `stateChange` 처리에서 `state === "FAILED"`이면 `setError(data.error || "분석에 실패했습니다")`와 `eventSource.close()`를 함께 한다. 처음 연결할 때 받는 `state` 이벤트로 FAILED를 받는 경우(새로고침)도 실패 화면이 떠야 한다.
- **비고**: 5단계에서 SSE를 제거하면 이 코드는 polling으로 대체된다. 그 전까지의 임시 조치다.
- **확인**: orchestrator 테스트에서 실패 시 `job_failed` 발행 확인. `tests/api/sse.test.ts`의 종료 이벤트 테스트가 계속 통과하는지 확인.

## 0-6. 중복 요청 방지의 경쟁 조건 수정

- **문제**: [analyze/route.ts](../../app/api/analyze/route.ts)가 59줄 `checkJobDeduplication`(GET) → 75줄 DB INSERT → 82줄 `setJobActive`(SET) 순서로 동작한다. 조회와 저장이 분리돼 있고, [cache.ts:44](../../services/cache.ts)의 SET에 `NX`가 없다.
  - 같은 프로필 요청이 동시에 오면 둘 다 통과해 작업이 두 개 실행된다(Gemini·GitHub 비용 두 배).
  - 키가 나중 요청의 jobId로 덮어써지고, 먼저 끝난 작업이 orchestrator의 `clearJobActive`(114·323·342줄)로 **다른 작업의 키**를 지운다.
  - 82줄 SET 뒤 84줄 `analysisQueue.add`가 실패하면, 실행되지 않을 PENDING 작업을 가리키는 키가 1시간 동안 남는다. 그동안 같은 프로필 요청은 이 작업 id를 받아 끝나지 않는 진행 화면을 보게 된다.
  - 72줄 "끝난 작업 키 정리" 경로에도 같은 경쟁 조건이 있다.
- **수정**:
  1. jobId를 먼저 만든다(`crypto.randomUUID()`, Prisma `create`에 `id`로 전달).
  2. `SET key jobId EX 3600 NX`로 키를 원자적으로 확보한다. 실패하면 기존 값을 GET해 그 작업이 PENDING/PROCESSING이면 그 id를 반환한다. 끝난 작업을 가리키면 아래 release로 그 값일 때만 지우고 SET NX를 한 번 더 시도한다.
  3. DB INSERT와 `analysisQueue.add`를 try로 감싸고, 실패하면 키를 release한 뒤 오류를 던진다.
  4. 해제 함수는 "값이 내 jobId일 때만 DEL"을 Lua 스크립트로 원자적으로 처리한다:
     ```lua
     if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
     return 0
     ```
  5. orchestrator의 `clearJobActive(githubUrl)` 세 곳을 `releaseJobActive(githubUrl, jobId)`로 바꾼다.
- **확인**: 테스트 추가
  - 같은 URL로 `POST`를 `Promise.all`로 두 번 → 응답 jobId가 같고 `analysis_jobs.create`가 한 번만 호출됨.
  - `analysisQueue.add`가 실패하도록 mock → 키가 해제되어 다음 요청이 새 작업을 만듦.
  - release가 다른 jobId 값을 지우지 않음.
  - 기존 `tests/api/analyze.test.ts`, `tests/services/cache.test.ts`의 mock(`setJobActive`, `clearJobActive`)을 새 함수에 맞게 수정.

## 0-7. 지어낸 대체 리포트 제거

- **문제**: 프로필 종합이 실패하면 [profile-aggregation.ts:146-207](../../services/analysis/profile-aggregation.ts)의 catch가 작업을 FAILED로 바꾸면서 대체 리포트를 저장한다. 주 역할이 근거 없이 `'Backend'`로 고정되고, 저장소 요약이 강점과 좋은 신호로 복사되며, 전체 요약은 `'aggregation_failed'`다. 리포트 페이지, `/api/report/[jobId]`, `/api/report/[jobId]/pdf`, `/api/widget/[jobId]`는 작업 상태를 보지 않고 리포트가 있으면 보여주므로, 이 내용이 정상 리포트와 README 위젯으로 노출된다.
- **수정**:
  - catch에서 대체 리포트 생성·저장(160~200줄 부근, `fallbackData`, `renderWidgetSvgVariants`, `profile_reports.create/update`)을 지운다. FAILED 기록, 오류 메시지 저장, `aggregation_failed` 발행, `throw`는 유지한다.
  - 리포트를 읽는 네 곳(`app/report/[jobId]/page.tsx`의 `getReport`, `app/api/report/[jobId]/route.ts`, `.../pdf/route.ts`, `app/api/widget/[jobId]/route.ts`)에서 `job.status !== 'COMPLETED'`이면 리포트가 없는 것처럼 처리한다(404 또는 null). 과거에 이미 저장된 대체 리포트도 이렇게 숨겨진다.
- **확인**: `tests/services/analysis/profile-aggregation.test.ts`의 대체 리포트 관련 기대값을 수정. `tests/api/report.test.ts`에 FAILED 작업은 404인 케이스 추가.

## 0-8. 커밋 필터 정규식 수정

- **문제**: [lib/commit-filter.ts](../../lib/commit-filter.ts)의 `REGEX_PATTERNS`가 단어 경계 없이 접두어로 비교한다. `/^doc/i`가 "Dockerize…", "document…"를, `/^style/i`가 "styled-components…"를, `/^lint/i`가 "linter…"를, `/^format/i`가 "formatter…"를, `/^merge/i`가 "mergeable…"을 걸러낸다. DevOps 역할 판단 근거가 사라지고, 커밋이 적은 저장소는 통째로 SKIPPED될 수 있다.
- **수정**: 각 패턴에 단어 경계를 넣는다. 예: `/^docs?\b/i`, `/^style\b/i`, `/^lint\b/i`, `/^format(ting)?\b/i`, `/^merged?\b/i`, `/^typo\b/i`, `/^readme\b/i`, `/^bump\b/i`, `/^chore\b/i`. Conventional Commits 접두어(`docs:`, `style(ui):`)는 계속 걸러져야 한다. `isMergeCommit`, `isDependencyUpdate`, `isArchiveOrMemo`도 같은 기준으로 점검한다.
- **확인**: `tests/lib/commit-filter.test.ts`에 추가
  - 통과해야 함: "Dockerize API server", "Document upload API 추가", "styled-components 도입", "linter 설정 추가", "formatter 도입"
  - 걸러져야 함: "docs: README 수정", "doc update", "style: 들여쓰기", "Merge branch 'main'", "chore: deps"

## 0-9. 타임아웃 타이머 해제

- **문제**: [orchestrator.ts:306-317](../../services/analysis/orchestrator.ts)의 `setTimeout`을 해제하지 않아, 정상 종료 후에도 10분(`ANALYSIS_TIMEOUT_MS`)짜리 타이머가 남는다.
- **수정**: 타이머 id를 변수에 담고 `Promise.race`를 `try { … } finally { clearTimeout(timer) }`로 감싼다.
- **0단계에서 하지 않는 것**: 타임아웃 이후에도 `analysisWork()`가 계속 실행되는 문제(실제 취소)는 `AbortController`를 저장소 루프까지 전달해야 하므로 5단계에서 다룬다.
- **확인**: jest fake timers로 정상 종료 후 남은 타이머가 없는지(`jest.getTimerCount() === 0`) 확인.

## 0-10. 리포트 페이지의 이중 단언과 죽은 섹션 제거

- **문제**: [app/report/[jobId]/page.tsx:77](../../app/report/[jobId]/page.tsx)의 `job.profile_report as unknown as PrismaProfileReport`가 타입 검사를 끈다. `PrismaProfileReport`의 `tech_stack`, `main_contribution_areas`, `repositories`는 `profile_reports` 테이블에 없는 필드라 항상 `undefined`다. 그래서 [ReportClient.tsx:312](../../app/report/[jobId]/ReportClient.tsx)의 "기술 스택"과 327줄의 "주요 기여 영역" 섹션은 한 번도 표시되지 않는다. 78줄과 `app/api/report/[jobId]/route.ts:33`에는 `(r: any)`도 있다.
- **수정** (결정: 섹션 제거):
  - `ReportClient.tsx`에서 두 섹션과 `techStack`, `mainContributionAreas` 타입 필드를 지운다.
  - `page.tsx`에서 손으로 정의한 `PrismaProfileReport`를 지우고 Prisma가 생성한 타입을 직접 쓴다. `normalizeReport`에서 없는 필드 매핑을 제거하고, `role_estimation`(JSON 컬럼)은 `schemas/profile-report.ts`의 `ProfileReportSchema.shape.roleEstimation.parse()`로 검증한다.
  - 두 곳의 `(r: any)`를 제거한다(Prisma 타입이 추론됨).
- **확인**: `npx tsc --noEmit -p tsconfig.json` 0 errors, `npx eslint` 통과, `tests/api/report.test.ts` 통과. 리포트 화면을 브라우저에서 한 번 열어 다른 섹션이 그대로인지 확인.

---

## 0단계에서 하지 않는 것 (다른 단계로 미룸)

| 문제 | 미루는 단계 | 이유 |
|---|---|---|
| 일부 저장소 실패가 기록 없이 빠진 채 COMPLETED 처리됨 | 3·5단계 | 저장소별 상태 컬럼이 필요 |
| 타임아웃 후에도 작업이 계속 실행됨 (실제 취소) | 5단계 | worker 루프 수정과 함께 |
| LLM 재시도 사이 대기 시간 없음 | 4단계 | `llm-client.ts`를 OpenAI 호환으로 다시 작성할 때 |
| 저장소마다 `getUserRepositories` 재호출, stargazers 전체 순회, star 검증 두 번 | 2단계 이후 | 버그가 아니라 성능 |
| PDF를 요청마다 새로 생성 | 2단계 이후 | 성능 |
| `neutral_news` 이름, 미사용 `services/pdf-generator.ts`, `RepositoryAnalysisSchema` 중복 정의, PrismaClient 두 개, `@prisma/client`·`playwright`가 devDependencies, Node 20 | 2단계 | 도메인 정리와 함께 |

## 참고: 테스트 실행 환경

- `node_modules`는 설치돼 있다.
- `npx prisma generate`가 필요하다.
- 기준선 명령: `npx jest`
