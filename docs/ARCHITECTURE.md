# Architecture

## 1. Technical Stack

### Frontend

* Next.js 16 App Router
* React 19
* TypeScript
* TailwindCSS 4

---

### Backend

* Next.js Route Handlers
* BullMQ worker (별도 프로세스)

---

### AI

* OpenAI 호환 endpoint(현재 DeepSeek)를 사용한다. base URL, API key, model은 환경 변수로 받는다
* JSON 응답(`response_format: json_object`) 사용
* temperature 0.1
* Zod 스키마로 응답 검증

---

### Database

* PostgreSQL
* Prisma 5

---

### Cache / Queue

* Redis (BullMQ 큐, 이벤트 pub/sub, 중복 요청 방지 키)

---

### PDF

* Playwright(Chromium)로 HTML을 렌더링해 PDF 생성

---

### Deployment

* Docker
* docker-compose
* GitHub Actions(`main`에 push하면 배포)

---

### Testing

* Jest (ts-jest)
* 브라우저 E2E 테스트는 현재 없음

---

## 2. System Architecture

### High-Level Flow

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

## 3. Background Job Architecture

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

## 4. Database Requirements

### Required Tables

* analysis_jobs
* repositories
* repository_analyses
* profile_reports
* pdf_exports

`profile_reports`에는 위젯 SVG(라이트·다크)도 함께 저장한다.

---

## 5. Redis Usage

Redis는 다음 용도로 쓴다.

* BullMQ 큐
* 진행 이벤트 pub/sub 채널
* 중복 요청 방지 키 (`job:{url hash}`, TTL 1시간)
* job 상태와 repository 목록 (TTL 1시간)

GitHub API 응답, README, commit log는 Redis에 캐싱하지 않는다. 분석 결과 재사용([PRD 5.7](PRD.md#57-이전-분석-재사용))은 PostgreSQL에 저장된 이전 결과를 쓴다.

---

## 6. LLM Processing Pipeline

### Step 1. Repository Analysis

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

### Step 2. Profile Aggregation

repository analysis 결과들을 기반으로 profile 수준 분석을 수행한다.

출력:

* overall summary
* role estimation (primary / secondary / recommended)
* engineering strengths
* collaboration patterns
* green flags / red flags

Profile 종합이 실패하면 job을 `FAILED`로 기록하고 리포트는 저장하지 않는다. 근거 없이 채운 대체 리포트는 만들지 않는다.

---

## 7. Structured Output Rules

LLM은 반드시 structured output을 사용해야 한다.

규칙:

* raw freeform response 금지
* zod validation 필수
* 낮은 temperature(0.1) 사용
* 빈 응답, malformed response, schema mismatch가 나오면 앱이 재시도한다(9절 참조)

---

## 8. Prompt Engineering Rules

### Requirements

* Prompt template 분리
* Repository analysis prompt 분리
* Aggregation prompt 분리
* Output format 명시
* Hallucination 최소화 (근거로 확인되는 내용만 보고하도록 지시)

---

## 9. Retry Policy

### GitHub API

* exponential backoff
* retry max 3

---

### LLM API

호출 자체가 실패한 경우는 SDK가, 응답 내용이 잘못된 경우는 앱이 재시도한다.

| 오류 | 재시도 | 횟수 | 대기 |
|---|---|---|---|
| 429, 5xx, 연결 오류, 타임아웃 | SDK | 2 | SDK의 지수 백오프 |
| 400, 401, 403, 404 등 | 없음 | 0 | — |
| 빈 응답, JSON 파싱 실패, Zod 검증 실패 | 앱 | 2 | 1초, 2초 |

* 앱은 SDK 오류를 다시 시도하지 않는다. 둘 다 재시도하면 호출이 최대 9번까지 나간다.
* 호출 1회의 타임아웃은 2분이다. 전체 분석 타임아웃(10분)과는 별개다.

---

### BullMQ

* job 단위 재시도 없음

---

## 10. Security Constraints

### Input Validation

검증 대상:

* request body 형식 (Zod 스키마)
* GitHub URL format
* analysis timeout
* invalid characters

---

### Limits

```text
Max pinned repositories: 6 (GitHub 제한)
Max commits per repository: 300
Max README size: 10KB
Concurrent repository analysis: 3
Analysis timeout: 10 minutes
```
