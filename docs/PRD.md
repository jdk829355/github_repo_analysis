## 1. Product Overview

GitHub Profile Analyzer는 사용자가 입력한 GitHub Profile URL을 기반으로 해당 사용자의 repository 및 commit history를 분석하여, 어떤 프로젝트를 수행했는지와 어떤 역할을 담당했는지를 자동으로 추론하는 서비스이다.

서비스는 GitHub API 데이터를 수집하고, Gemini API 기반 LLM 분석을 통해 repository 수준 및 profile 수준의 엔지니어링 보고서를 생성한다.

최종 결과는 웹 UI와 PDF 형태로 제공된다.

---

# 2. Goals

## Primary Goals

* GitHub profile 기반 자동 엔지니어링 리포트 생성
* Repository README 및 Commit History 기반 역할 분석
* Backend / Frontend / DevOps / ML 역할 추론
* Lead 여부 추론
* PDF export 지원
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
* multi-user tenancy
* analytics dashboard
* vector database
* semantic search

---

# 4. User Flow

```text
Landing Page
→ GitHub Profile URL 입력
→ Analysis Job 생성
→ Repository 수집
→ Commit/README 분석
→ Profile Aggregation
→ Report 생성
→ 결과 조회
→ PDF Export
```

---

# 5. Functional Requirements

## 5.1 GitHub Profile Input

사용자는 GitHub profile URL을 입력할 수 있어야 한다.

예시:

```text
https://github.com/username
```

---

## 5.2 Repository Collection

시스템은 GitHub API를 통해 다음 데이터를 수집해야 한다.

### Repository Metadata

* repository name
* description
* primary language
* stars
* forks
* updated date

### Repository Content

* README
* commit logs

---

## 5.3 Repository Filtering Rules

다음 repository는 기본적으로 제외한다.

* fork repository
* archived repository
* empty repository

---

## 5.4 Commit Collection Rules

기본 정책:

* repository 당 최대 최근 300개 commit 분석
* authored commit만 분석
* merge commit 제외
* auto-generated commit 제외

---

## 5.5 Commit Filtering Rules

다음 regex와 매칭되는 commit은 분석에서 제외한다.

```regex
^merge
^merged
^typo
^fix lint
^lint
^format
^prettier
^eslint
^style
^docs
^doc
^readme
^bump
^chore
^update dependency
^dependabot
^[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}
^[0-9]{6,8}$
^wip$
^temp$
```

또한 다음 조건도 제외한다.

* meaningless one-word commit
* dependency update
* archive/memo commit
* formatting-only commit

---

# 6. Report Structure

최종 보고서는 다음 섹션으로 구성한다.

```text
1. Overall Summary
2. Tech Stack Analysis
3. Main Contribution Areas
4. Repository Breakdown
5. Estimated Roles
6. Engineering Strengths
7. Collaboration Patterns
```

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

---

# 8. Technical Stack

## Frontend

* Next.js App Router
* TypeScript
* TailwindCSS

---

## Backend

* Next.js Route Handlers
* Server Actions

---

## AI

* Gemini Flash-Lite 계열 모델
* Structured Output 사용
* Deterministic temperature 설정

---

## Database

* PostgreSQL

---

## Cache

* Redis

---

## Deployment

* Docker
* docker-compose

---

## Testing

* Jest
* cmux browser testing

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

---

# 10. System Architecture

## High-Level Flow

```text
User Request
→ Job Creation
→ GitHub Fetching
→ Repository Analysis
→ Profile Aggregation
→ Report Generation
→ PDF Export
```

---

# 11. Background Job Architecture

분석은 synchronous request로 수행하지 않는다.

분석 방식:

```text
submit url
→ create job
→ enqueue analysis
→ polling status
→ generate report
```

---

# 12. Database Requirements

## Required Tables

* analysis_jobs
* repositories
* repository_analyses
* profile_reports
* pdf_exports

---

# 13. Redis Cache Strategy

Redis는 다음 데이터를 캐싱한다.

* GitHub API responses
* README content
* commit logs
* LLM intermediate outputs

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
* role estimation
* engineering strengths
* collaboration patterns

---

# 15. Structured Output Rules

LLM은 반드시 structured output을 사용해야 한다.

규칙:

* raw freeform response 금지
* zod validation 필수
* malformed response retry 수행
* deterministic temperature 사용
* schema mismatch 시 재시도 수행

---

# 16. Prompt Engineering Rules

## Requirements

* Prompt template 분리
* Repository analysis prompt 분리
* Aggregation prompt 분리
* Output format 명시
* Hallucination 최소화

---

# 17. Error Handling Rules

다음 에러를 처리해야 한다.

* invalid GitHub URL
* GitHub rate limit
* repository fetch failure
* README missing
* empty repository
* Gemini API failure
* malformed LLM output
* timeout

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

# 19. Security Constraints

## Input Validation

검증 대상:

* GitHub URL format
* repository count upper bound
* analysis timeout
* invalid characters

---

## Limits

```text
Max repository count: 50
Max commits per repository: 300
Concurrent repository analysis: 3
Analysis timeout: 10 minutes
```

---

# 20. PDF Export Requirements

PDF export는 HTML 기반 렌더링 후 생성한다.

권장 구현:

* Puppeteer 기반 PDF 생성

PDF에는 다음이 포함되어야 한다.

* overall summary
* repository breakdown
* role analysis
* strengths analysis

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
* llm parser
* zod validation
* aggregation service
* report generator

---

## UI/E2E Test Scope

cmux browser 기능을 사용하여 다음 시나리오를 테스트한다.

### Required Scenarios

* landing page access
* github url input
* analysis start
* polling flow
* report rendering
* pdf download
* invalid url handling
* timeout handling

---

# 23. Docker Requirements

## Required Containers

* next-app
* postgres
* redis

---

## Required Commands

반드시 다음 흐름 검증 수행:

```bash
docker build
docker compose up
application access verification
ui test execution
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
/tests
/docker
```

---

# 25. Definition of Done

다음 조건을 만족해야 완료로 간주한다.

* GitHub URL 입력 가능
* Repository 분석 가능
* Structured output validation 통과
* Report 생성 가능
* PDF export 가능
* Jest tests passing
* Docker build success
* Docker runtime success
* UI tests passing

---

# 26. Future Expansion

향후 확장 가능 영역:

* private repository support
* OAuth login
* multi-user workspace
* vector search
* report history
* team analysis
* resume generation
* hiring evaluation mode
* recruiter dashboard
