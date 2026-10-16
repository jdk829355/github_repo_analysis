## 1. Product Overview

GitHub Profile Analyzer(서비스 이름 Pinned Signal)는 사용자가 입력한 GitHub Profile URL에서 pin된 repository와 commit history를 분석해 어떤 프로젝트를 수행했고 어떤 역할을 맡았는지 자동으로 추론하는 서비스이다.

서비스는 GitHub API로 데이터를 수집하고 Gemini API 기반 LLM으로 repository 수준과 profile 수준의 엔지니어링 보고서를 만든다.

결과는 웹 UI, PDF, README에 넣을 수 있는 SVG 위젯으로 제공한다.

---

# 2. Goals

## Primary Goals

* GitHub profile의 pin된 repository를 기반으로 엔지니어링 리포트 자동 생성
* Repository README 및 Commit History 기반 역할 분석
* Backend / Frontend / DevOps / ML 역할 추론
* Lead 여부 추론
* Green Flags / Red Flags 도출
* PDF export 지원
* SVG 위젯(라이트·다크) 제공
* Docker 기반 배포 가능 구조 제공
* Agent 친화적인 deterministic architecture 유지

---

# 3. Non-Goals

현재 버전에서 제외한다.

* 회원가입 / 로그인
* OAuth 인증
* 팀 협업 기능
* 실시간 collaborative editing
* private repository 분석
* pin되지 않은 repository 분석
* multi-user tenancy
* analytics dashboard
* vector database
* semantic search

---

# 4. User Flow

```text
Landing Page
→ GitHub Profile URL 입력
→ Star 검증
→ Analysis Job 생성
→ Pinned Repository 수집
→ Commit/README 분석
→ Profile Aggregation
→ Report 생성
→ 결과 조회
→ PDF Export / SVG 위젯 내보내기
```

---

# 5. Functional Requirements

## 5.1 GitHub Profile Input

사용자는 GitHub profile URL을 입력할 수 있어야 한다.

예시:

```text
https://github.com/username
```

`github.com/username`이나 `username`만 입력해도 위 형식으로 정규화한다. 올바른 GitHub username 형식이 아니면 요청을 거부한다.

---

## 5.2 Repository Collection

시스템은 GitHub API로 다음 데이터를 수집한다.

분석 대상은 profile에 **pin된 repository**(GraphQL `pinnedItems`, 최대 6개)이다.

### Repository Metadata

* repository name
* description
* primary language
* stars
* forks
* updated date

### Repository Content

* README (최대 10KB까지 사용)
* commit logs

---

## 5.3 Repository Filtering Rules

pin된 repository 중 다음은 제외한다.

* fork repository
* archived repository
* empty repository

제외하고 나서 남은 repository가 없으면 job은 `FAILED`로 끝난다.

---

## 5.4 Commit Collection Rules

기본 정책:

* repository 당 최대 300개 commit 수집
* 해당 username이 작성한 commit만 분석 (GitHub API `author` 조건)
* merge commit 제외
* auto-generated commit 제외 (5.5의 규칙으로 거른다)

거르고 남은 commit이 없는 repository는 `SKIPPED`로 처리하고 분석에서 뺀다.

---

## 5.5 Commit Filtering Rules

다음 regex와 매칭되는 commit은 분석에서 제외한다. 모든 패턴은 대소문자를 구분하지 않고 단어 경계를 포함한다. 그래서 `docs: ...`는 걸러지지만 `Dockerize ...`, `Document ...`, `styled-components ...`, `linter ...`는 통과한다.

```regex
^merged?\b
^typo\b
^fix\s+lint\b
^lint\b
^format(ting)?\b
^prettier\b
^eslint\b
^style\b
^docs?\b
^readme\b
^bump\b
^chore\b
^update\s+dependency\b
^dependabot\b
^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}
^[0-9]{6,8}$
^wip$
^temp$
```

또한 다음 조건도 제외한다.

* meaningless one-word commit (영문 6자 이하 한 단어)
* dependency update
* archive/memo commit
* formatting-only commit

---

## 5.6 Star 검증

분석을 요청한 계정이 이 프로젝트의 repository(`jdk829355/github_repo_analysis`)에 star를 눌렀는지 확인한다.

* 별도 인증 절차는 아니다. 입력한 username이 해당 repository의 stargazer 목록에 있는지만 본다.
* 검증을 통과하지 못하면 분석 job을 만들지 않고 403으로 응답한다.
* 검증만 따로 수행하는 `POST /api/verify-star`와 job 생성 시점의 검증은 같은 기준을 쓴다.

---

## 5.7 이전 분석 재사용

같은 profile을 이전에 분석해 `COMPLETED`된 job이 있으면 다음처럼 재사용한다.

* pin된 repository의 `updated_at`이 이전과 같으면 그 repository의 분석 결과를 다시 쓴다.
* 더는 pin되지 않은 repository의 이전 결과는 삭제한다.
* pin된 repository 구성과 각 `updated_at`이 모두 같고 이전 리포트에 Green/Red Flags가 있으면 profile 종합 결과와 위젯도 다시 쓴다.

---

# 6. Report Structure

최종 보고서는 다음 섹션으로 구성한다.

```text
1. Overall Summary
2. Green Flags / Red Flags
3. Pinned Repository Breakdown
4. Estimated Roles
5. Engineering Strengths
6. Collaboration Patterns
```

Repository 단위 분석에는 `techStack`, `mainContributions`가 포함되어 DB에 저장되지만 보고서에는 별도 섹션으로 표시하지 않는다.

PDF에는 Overall Summary, Green/Red Flags, Repository Breakdown, Estimated Roles, Engineering Strengths가 들어간다.

---

# 7. Role Estimation Rules

시스템은 다음 역할을 추론해야 한다.

* Backend
* Frontend
* DevOps
* ML

또한 다음 여부를 추론한다.

* Technical Lead
* Maintainer
* Architecture Contributor

Profile 수준 결과는 주 역할(primary), 보조 역할(secondary), 추천 역할(recommended)로 나눈다. 역할 값은 코드에서 문자열로만 검증하고, 위 목록은 프롬프트로 안내한다.

---

# 8. Technical Stack

## Frontend

* Next.js 16 App Router
* React 19
* TypeScript
* TailwindCSS 4

---

## Backend

* Next.js Route Handlers
* BullMQ worker (별도 프로세스)

---

## AI

* Gemini `gemini-2.5-flash-lite`
* JSON 응답(`responseMimeType: application/json`) 사용
* temperature 0.1
* Zod 스키마로 응답 검증

---

## Database

* PostgreSQL
* Prisma 5

---

## Cache / Queue

* Redis (BullMQ 큐, 이벤트 pub/sub, 중복 요청 방지 키)

---

## PDF

* Playwright(Chromium)로 HTML을 렌더링해 PDF 생성

---

## Deployment

* Docker
* docker-compose
* GitHub Actions(`main`에 push하면 배포)

---

## Testing

* Jest (ts-jest)
* 브라우저 E2E 테스트는 현재 없음

---

# 9. Environment Variables

프로젝트 루트 `.env` 파일에 정의한다.

```env
GITHUB_TOKEN=
GEMINI_API_KEY=

DATABASE_URL=
REDIS_URL=

NEXT_PUBLIC_APP_URL=
```

Docker 이미지에서는 이 외에 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`(시스템 Chromium 경로)와 `PDF_EXPORT_DIR`(PDF 저장 경로)을 설정한다.

---

# 10. System Architecture

## High-Level Flow

```text
User Request
→ Star Verification
→ Job Creation
→ Queue (BullMQ)
→ Worker: GitHub Fetching
→ Repository Analysis
→ Profile Aggregation
→ Report Generation
→ PDF Export / SVG Widget
```

프로세스는 둘로 나뉜다. `next-app`은 요청을 받아 job을 만들고 큐에 넣는다. `worker`는 큐에서 job을 꺼내 분석을 수행한다. `next-app`은 Worker를 만들지 않는다.

---

# 11. Background Job Architecture

분석은 synchronous request로 수행하지 않는다.

분석 방식:

```text
submit url
→ verify star
→ create job (jobId 선생성, Redis 키로 중복 요청 방지)
→ enqueue analysis (BullMQ)
→ worker 실행 (동시 3개)
→ SSE로 진행 상황 전달
→ generate report
```

* Job 상태는 `PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`이다.
* 같은 profile의 진행 중 job이 있으면 새로 만들지 않고 그 jobId를 반환한다. 이 판단은 Redis `SET NX`로 원자적으로 한다.
* BullMQ 재시도는 쓰지 않는다(`attempts: 1`).
* 진행 상황과 완료·실패 여부는 SSE(`GET /api/analysis/[jobId]/events`)로 전달한다. 실패하면 `job_failed` 이벤트로 실패 화면을 보여준다.
* `COMPLETED`가 아닌 job은 리포트가 저장돼 있어도 조회·PDF·위젯 요청에 404로 응답한다.

---

# 12. Database Requirements

## Required Tables

* analysis_jobs
* repositories
* repository_analyses
* profile_reports
* pdf_exports

`profile_reports`에는 위젯 SVG(라이트·다크)도 함께 저장한다.

---

# 13. Redis Usage

Redis는 다음 용도로 쓴다.

* BullMQ 큐
* 진행 이벤트 pub/sub 채널
* 중복 요청 방지 키 (`job:{url hash}`, TTL 1시간)
* job 상태와 repository 목록 (TTL 1시간)

GitHub API 응답, README, commit log는 Redis에 캐싱하지 않는다. 분석 결과 재사용(5.7)은 PostgreSQL에 저장된 이전 결과를 쓴다.

---

# 14. LLM Processing Pipeline

## Step 1. Repository Analysis

입력:

* README
* commit logs
* repository metadata

출력:

```json
{
  "repositoryName": "",
  "summary": "",
  "projectType": "",
  "estimatedRoles": [],
  "mainContributions": [],
  "techStack": [],
  "leadershipSignals": [],
  "confidence": 0.0
}
```

---

## Step 2. Profile Aggregation

repository analysis 결과들을 기반으로 profile 수준 분석을 수행한다.

출력:

* overall summary
* role estimation (primary / secondary / recommended)
* engineering strengths
* collaboration patterns
* green flags / red flags

Profile 종합이 실패하면 job을 `FAILED`로 기록하고 리포트는 저장하지 않는다. 근거 없이 채운 대체 리포트는 만들지 않는다.

---

# 15. Structured Output Rules

LLM은 반드시 structured output을 사용해야 한다.

규칙:

* raw freeform response 금지
* zod validation 필수
* malformed response retry 수행
* 낮은 temperature(0.1) 사용
* schema mismatch 시 재시도 수행

---

# 16. Prompt Engineering Rules

## Requirements

* Prompt template 분리
* Repository analysis prompt 분리
* Aggregation prompt 분리
* Output format 명시
* Hallucination 최소화 (근거로 확인되는 내용만 보고하도록 지시)

---

# 17. Error Handling Rules

다음 에러를 처리해야 한다.

* invalid GitHub URL
* star 검증 실패
* GitHub rate limit
* repository fetch failure
* README missing (README 없이 분석을 계속한다)
* empty repository
* pin된 repository 없음
* Gemini API failure
* malformed LLM output
* timeout

한 repository의 분석이 실패해도 job 전체는 실패하지 않는다. 그 repository만 빠진다. 분석에 성공한 repository가 하나도 없으면 profile 종합 단계에서 job이 `FAILED`가 된다.

---

# 18. Retry Policy

## GitHub API

* exponential backoff
* retry max 3

---

## Gemini API

* malformed output retry
* timeout retry
* retry max 2

---

## BullMQ

* job 단위 재시도 없음

---

# 19. Security Constraints

## Input Validation

검증 대상:

* request body 형식 (Zod 스키마)
* GitHub URL format
* analysis timeout
* invalid characters

---

## Limits

```text
Max pinned repositories: 6 (GitHub 제한)
Max commits per repository: 300
Max README size: 10KB
Concurrent repository analysis: 3
Analysis timeout: 10 minutes
```

---

# 20. Export Requirements

## 20.1 PDF

PDF export는 HTML 기반 렌더링 후 생성한다.

구현:

* Playwright(Chromium) 기반 PDF 생성

PDF에는 다음이 포함되어야 한다.

* overall summary
* green / red flags
* repository breakdown
* role analysis
* strengths analysis

---

## 20.2 SVG Widget

분석이 끝난 profile의 요약 카드를 SVG 이미지로 제공한다. GitHub README에 붙여 넣는 용도이다.

* `GET /api/widget/[jobId]?theme=light|dark`로 제공한다. theme을 생략하면 light이다.
* 위젯에는 사용자명, 요약, 역할, Green/Red Flags, 주요 언어가 들어간다.
* 리포트를 만들 때 라이트·다크 SVG를 함께 만들어 저장한다. 저장된 SVG가 현재 위젯 버전이 아니면 다시 만든다.
* 리포트 화면의 "SVG 위젯 내보내기"에서 미리보기와 Markdown 코드 복사를 제공한다.

---

# 21. Coding Rules

## TypeScript Rules

* strict mode 활성화
* avoid any
* explicit typing 사용

---

## Architecture Rules

* service layer 분리
* UI layer에서 Gemini 직접 호출 금지
* pure function 우선
* utility 함수 테스트 가능 구조 유지
* Queue와 Worker 모듈 분리: Worker는 worker 진입점에서만 만든다

---

## API Rules

* 모든 external API timeout 설정
* retry 정책 적용
* error boundary 적용

---

# 22. Testing Requirements

## TDD Requirements

개발 전 테스트 코드 작성 필수.

---

## Unit Test Scope

반드시 테스트할 영역:

* github client
* commit filtering
* llm client / parser
* zod validation
* orchestrator, repository analysis, aggregation service
* queue / worker 모듈 분리
* report / PDF / widget API

---

## UI/E2E Test Scope

현재 자동화된 브라우저 E2E 테스트는 없다. 다음 시나리오는 수동으로 확인한다.

### Required Scenarios

* landing page access
* github url input
* star 검증 실패 처리
* analysis start
* progress flow
* report rendering
* pdf download
* widget export
* invalid url handling
* timeout / failure handling

---

# 23. Docker Requirements

## Required Containers

* next-app
* worker
* redis

PostgreSQL은 `DATABASE_URL`로 연결하는 외부 인스턴스를 쓴다. docker-compose의 postgres 서비스는 주석 처리되어 있다.

---

## Required Commands

반드시 다음 흐름 검증 수행:

```bash
docker build
docker compose up
application access verification
```

---

# 24. Directory Structure

```text
/app
/components
/lib
/services
/prompts
/schemas
/workers
/prisma
/tests
```

---

# 25. Definition of Done

다음 조건을 만족해야 완료로 간주한다.

* GitHub URL 입력 가능
* Star 검증 동작
* Pinned repository 분석 가능
* Structured output validation 통과
* Report 생성 가능
* PDF export 가능
* SVG 위젯 제공 가능
* Jest tests passing
* Docker build success
* Docker runtime success

---

# 26. Future Expansion

향후 확장 가능 영역:

* private repository support
* pin되지 않은 repository 분석
* OAuth login
* multi-user workspace
* vector search
* report history
* team analysis
* resume generation
* hiring evaluation mode
* recruiter dashboard

---

# 27. 향후 변경 예정

리팩터링 계획에 따라 다음이 바뀔 예정이다. 이 문서는 현재 구현을 기준으로 쓰므로, 바뀌면 해당 절을 고친다.

* LLM 호출을 Gemini SDK에서 OpenAI 호환 endpoint로 전환 (8, 15, 18절)
* SSE를 없애고 상태 조회 API와 polling으로 전환 (11절). Redis와 BullMQ는 큐 용도로 유지한다.
* 실패한 분석의 수동 재시도 옵션 제공
* 요구사항과 도메인 규칙 정리, 이에 따른 DB 테이블·필드 추가
