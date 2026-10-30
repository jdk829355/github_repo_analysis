# Architecture

## 1. Technical Stack

### Frontend

* Thymeleaf 템플릿 (서버 렌더링)
* HTMX 2 (분석 요청 폼, 진행 화면 polling)
* TailwindCSS 4 (standalone CLI로 빌드)
* 리포트 화면 스크립트 `report.js` (바닐라 JS)

---

### Backend

* Java 25, Spring Boot 4 (Web MVC)
* 분석 워커는 같은 JVM 안의 스레드풀 (3개)

---

### AI

* OpenAI 호환 endpoint(현재 DeepSeek)를 `openai-java` SDK로 사용한다. base URL, API key, model은 환경 변수로 받는다
* JSON 응답(`response_format: json_object`) 사용
* temperature 0.1
* Java record와 Bean Validation으로 응답 검증

---

### Database

* PostgreSQL (Supabase)
* Spring Data JPA (Hibernate 7)
* Flyway

---

### Queue

* `analysis_jobs` 테이블 (3절)

---

### Deployment

* Docker (컨테이너 하나)
* docker-compose (`deploy/docker-compose.yml`)
* GitHub Actions(`main`에 push하면 배포)

---

### Testing

* JUnit 5, AssertJ, Mockito
* Testcontainers(Postgres), WireMock(GitHub·LLM), MockMvc
* 브라우저 E2E 테스트는 현재 없음

---

## 2. System Architecture

### High-Level Flow

```text
User Request
→ Star Verification
→ Job Creation (PENDING 행 INSERT)
→ Queue Poller (FOR UPDATE SKIP LOCKED)
→ Worker: GitHub Fetching
→ Repository Analysis
→ Profile Aggregation
→ Report Generation
→ SVG Widget
```

웹 요청과 분석 워커가 한 JVM에서 돈다. 요청은 `PENDING` 작업 행만 만들고 1초마다 도는 폴러가 빈 슬롯이 있을 때 작업을 하나씩 집어 스레드풀에서 실행한다. 서버는 한 대라고 가정한다.

---

## 3. Background Job Architecture

분석은 synchronous request로 수행하지 않는다.

분석 방식:

```text
submit url
→ verify star
→ create job (PENDING 행 INSERT, partial unique index로 중복 요청 방지)
→ poller가 PENDING 작업을 PROCESSING으로 바꿔 집음
→ worker 실행 (동시 3개)
→ 화면이 2초마다 진행 상태 polling
→ generate report
```

* Job 상태는 `PENDING` → `PROCESSING` → `COMPLETED` / `FAILED`이다. 저장소별 상태(`PENDING`, `ANALYZING`, `COMPLETED`, `SKIPPED`, `FAILED`)는 `repositories.status`에 남는다.
* 같은 profile의 진행 중 job이 있으면 새로 만들지 않고 그 jobId를 반환한다. `analysis_jobs(github_profile)`에 진행 중인 작업만 대상으로 하는 partial unique index가 이를 보장한다.
* 재시도는 하지 않는다. 앱이 재시작되면 `PROCESSING`으로 남은 작업은 `FAILED`가 된다.
* 진행 화면은 `GET /analysis/{jobId}/progress`를 2초마다 불러 HTML 조각을 바꿔 끼운다. 완료되면 리포트로 이동하고 실패하면 실패 문구를 보여 주고 polling을 멈춘다(HTTP 286).
* `COMPLETED`가 아닌 job은 리포트가 저장돼 있어도 조회·위젯 요청에 404로 응답한다.

---

## 4. Database Requirements

### Required Tables

* analysis_jobs
* repositories
* repository_analyses
* profile_reports
* pdf_exports

`profile_reports`에는 위젯 SVG(라이트·다크)도 함께 저장한다. `pdf_exports` 테이블은 남아 있지만 PDF 내보내기를 뺐으므로 쓰지 않는다.

---

## 5. Cache

Redis는 쓰지 않는다. 큐, 진행 상태, 중복 요청 방지는 모두 PostgreSQL이 맡는다(3절).

GitHub API 응답, README, commit log는 캐싱하지 않는다. 분석 결과 재사용([PRD 5.7](PRD.md#57-이전-분석-재사용))은 PostgreSQL에 저장된 이전 결과를 쓴다.

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
* 응답 검증 필수 (record + Bean Validation)
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
| 빈 응답, JSON 파싱 실패, 응답 검증 실패 | 앱 | 2 | 1초, 2초 |

* 앱은 SDK 오류를 다시 시도하지 않는다. 둘 다 재시도하면 호출이 최대 9번까지 나간다.
* 호출 1회의 타임아웃은 2분이다. 전체 분석 타임아웃(10분)과는 별개다.

---

### Analysis Job

* job 단위 재시도 없음

---

## 10. Security Constraints

### Input Validation

검증 대상:

* 요청 형식
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
