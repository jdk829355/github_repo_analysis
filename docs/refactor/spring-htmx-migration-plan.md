# Spring Boot + HTMX 마이그레이션 계획

Next.js(React) + BullMQ + Redis 구조를 Spring Boot + Thymeleaf + HTMX로 옮기는 계획이다. 진행 상황은 SSE 대신 polling으로 보여주고, Redis를 없애 Postgres만으로 운영한다.
리팩터링 순서(0 → 6)의 5단계("SSE 제거, polling 도입, Redis와 BullMQ는 큐 용도로 유지")를 대신한다. BullMQ를 유지하기로 했던 건 Node 스택이 전제였는데, Spring으로 옮기면 BullMQ를 쓸 수 없어서 그 전제가 사라진다.
줄 번호는 `main`의 커밋 `c51159d` 기준이다.

## 결정된 사항

- 백엔드는 Spring Boot, 화면은 Thymeleaf 템플릿과 HTMX로 만든다. React와 Next.js는 쓰지 않는다.
- 진행 상황은 polling으로 보여준다. SSE와 Redis pub/sub은 옮기지 않는다.
- Redis를 없앤다. 지금 Redis가 맡은 다섯 가지는 아래처럼 바꾼다.

  | 지금 Redis가 하는 일 | 위치 | 바뀐 뒤 |
  |---|---|---|
  | 작업 큐 (BullMQ, 웹 → 워커 컨테이너) | [lib/queue.ts](../../lib/queue.ts), [analyze/route.ts:114](../../app/api/analyze/route.ts) | 같은 앱 안의 스레드풀(3개)이 `analysis_jobs`에서 `PENDING`을 `FOR UPDATE SKIP LOCKED`로 집어 간다 |
  | 진행 이벤트 pub/sub | `publishEvent`, [events/route.ts](../../app/api/analysis/[jobId]/events/route.ts) | 없앤다. 화면이 DB 상태를 polling한다 |
  | 작업 상태 캐시 `analysis:{id}:state` | [lib/queue.ts:40](../../lib/queue.ts) | 없앤다. DB `analysis_jobs.status`만 읽는다 |
  | 저장소 목록 `job:{id}:repos` | [orchestrator.ts:119](../../services/analysis/orchestrator.ts) | 분석을 시작할 때 `repositories` 행을 미리 만든다 (S-2) |
  | 중복 분석 방지 락 (`SET NX` + TTL, Lua 해제) | [services/cache.ts](../../services/cache.ts) | `analysis_jobs(github_profile)`에 진행 중인 작업만 대상으로 하는 partial unique index |

- 앱은 컨테이너 하나로 띄운다. 웹 요청과 분석 워커가 같은 JVM에서 돈다. **서버는 한 대라고 가정한다.** 여러 대로 늘리면 S-4의 재시작 복구 방식을 바꿔야 한다.
- 외부에 퍼진 URL은 그대로 유지한다. GitHub README에 붙은 위젯과 리포트 링크가 깨지면 안 된다.
  - `GET /api/widget/{jobId}?theme=light|dark`: 응답 형식(`image/svg+xml`)과 `Cache-Control` 헤더까지 지금과 같게 둔다
  - `GET /report/{jobId}`
- PDF 내보내기는 이번 마이그레이션에서 뺀다. 버튼은 이미 숨겨져 있다(`d076785`). Chromium이 빠지면 이미지가 크게 작아진다. 필요해지면 Playwright for Java로 다시 만든다.
- 운영 DB(Supabase, 스키마 `pinnedsignal`)와 기존 데이터는 그대로 쓴다. 기존 cuid ID는 문자열 PK로 다루고, 새 ID는 UUID 문자열로 만든다.

## 사용자가 정할 것

| # | 질문 | 추천 |
|---|---|---|
| Q1 | 코드를 어디서 개발하나 | 같은 저장소의 브랜치 `refactor/spring-migration`에서 `server/` 디렉터리에 만든다. 전환 커밋(S-7)에서 Node 코드를 지우고 루트로 올린다. 기존 TS 코드를 옆에 두고 보면서 옮길 수 있다 |
| Q2 | Java 버전 | 25 (최신 LTS). 라이브러리 호환 문제가 생기면 21로 내린다 |
| Q3 | 전환할 때 몇 분 정도 서비스가 멈춰도 되나 | 된다고 가정했다. 안 된다면 S-7 절차를 다시 짠다 |
| Q4 | 프로필 리포트 재사용 조건을 그대로 둘까 | 그대로 둔다. S-2의 "동작 변화 주의" 참고 |
| Q5 | 서버 메모리 여유 | 사용자가 SSH로 `free -h`를 확인한다. JVM 한 개에 힙 512MB 안팎이면 충분할 것으로 본다 |

## 진행 방식

- 확인 기준: 기존 Node 쪽은 지금 기준선(Jest 300개 전부 통과)을 유지한다. Spring 쪽은 커밋마다 `./gradlew test`가 통과해야 한다.
- 전환(S-7) 전까지 운영은 계속 Node 앱이 맡는다. DB 스키마 변경은 전환 때 한 번에 적용한다.

| # | 작업 | 예상 | 상태 |
|---|---|---|---|
| S-0 | 기존 동작 목록 정리, 결정 확정 | 0.5일 | 대기 (Q1~Q5) |
| S-1 | Spring 프로젝트 골격 | 1일 | 대기 |
| S-2 | DB 계층과 스키마 변경 | 1.5일 | 대기 |
| S-3 | GitHub·LLM 클라이언트, 프롬프트, 응답 검증 | 2~3일 | 대기 |
| S-4 | 분석 파이프라인과 DB 큐 | 2~3일 | 대기 |
| S-5 | 화면과 엔드포인트 (Thymeleaf + HTMX) | 3~4일 | 대기 |
| S-6 | 테스트 | 3~4일 (S-1~S-5와 함께) | 대기 |
| S-7 | 배포 파이프라인 교체와 운영 전환 | 1~2일 | 대기 |
| S-8 | Node 코드 제거, 문서 갱신 | 0.5일 | 대기 |

합계는 약 2.5~3주다. 가장 큰 위험은 S-4의 파이프라인 동작(재사용 규칙, 타임아웃, 실패 처리)을 지금과 똑같이 맞추는 일이다.

---

## S-0. 기존 동작 목록 정리

- Jest 테스트 300개에서 "지켜야 하는 동작"을 뽑아 이 문서 끝의 [동작 체크리스트](#동작-체크리스트)를 채운다. 테스트를 1:1로 옮기지 않고 이 목록을 기준으로 새로 쓴다.
- Q1~Q5를 정한다.

## S-1. Spring 프로젝트 골격

- **구성**: Gradle(Kotlin DSL), Spring Boot 최신 안정판, `spring-boot-starter-web`, `-thymeleaf`, `-data-jpa`, `-validation`, `-actuator`, Flyway, PostgreSQL 드라이버.
- **정적 파일**: HTMX 2.x를 `static/js/`에 버전을 고정해 직접 넣는다(CDN 안 씀). Tailwind v4는 standalone CLI로 빌드한다. 입력은 [app/globals.css](../../app/globals.css)를 옮긴 파일, 스캔 대상은 `templates/**/*.html`이다. 빌드에 Node가 필요 없다.
- **설정**: 환경 변수 이름을 그대로 쓴다(`GITHUB_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). [lib/config.ts](../../lib/config.ts)처럼 없으면 부팅이 실패하게 한다. `REDIS_URL`은 없애고 `NEXT_PUBLIC_APP_URL`은 서버 코드 어디에서도 읽지 않으므로 함께 없앤다.
- **DB 연결**: Prisma의 `DATABASE_URL`(`postgresql://user:pass@host/db?schema=...`)은 JDBC 형식이 아니다. `SPRING_DATASOURCE_URL`(`jdbc:postgresql://host/db?currentSchema=pinnedsignal`), `_USERNAME`, `_PASSWORD` 세 개로 나눈다. 서버 `.env`는 S-7에서 바꾼다.
- **커넥션 풀**: Hikari `maximum-pool-size`를 5 안팎으로 작게 둔다. Supabase 세션 모드 풀이 15개이고, polling과 워커 3개가 같은 풀을 쓴다.
- **로그**: Spring Boot 내장 구조화 로그(`logging.structured.format.console`)로 stdout에 JSON을 한 줄씩 쓴다. [observability-plan](observability-plan.md)의 규칙을 그대로 지킨다.
  - `event` 이름을 지금과 같게 쓴다(`job.started`, `job.completed`, `job.failed`, `repo.*`, `llm.call`, `api.error` 등).
  - 비밀값 마스킹(필드 경로 `redact`와 `scrubSecrets` 패턴)을 옮긴다. 원본은 [lib/logger.ts](../../lib/logger.ts)다.
  - LLM 프롬프트와 원본 응답은 남기지 않는다.
- **확인**: `./gradlew bootRun`으로 빈 페이지가 뜨고 Tailwind 클래스가 적용된다.

## S-2. DB 계층과 스키마 변경

### 엔티티

- 테이블 5개(`analysis_jobs`, `repositories`, `repository_analyses`, `profile_reports`, `pdf_exports`)를 JPA 엔티티로 만든다. `pdf_exports`는 PDF를 빼므로 매핑만 하거나 생략한다.
- Postgres 타입 매핑에 주의한다.
  - `String[]` 컬럼(`estimated_roles`, `tech_stack`, `green_flags` 등): `@JdbcTypeCode(SqlTypes.ARRAY)`
  - `role_estimation`(Json): `@JdbcTypeCode(SqlTypes.JSON)`과 record 타입
  - `status`: Prisma가 만든 Postgres enum 타입 `"AnalysisJobStatus"`다. `@JdbcType(PostgreSQLEnumJdbcType.class)`로 매핑한다.
  - `updated_at`: Prisma `@updatedAt`은 DB가 아니라 클라이언트가 채운다. `@UpdateTimestamp`로 맞춘다.

### Flyway

- `V1__baseline.sql`: 현재 스키마를 `pg_dump --schema-only`로 떠서 넣는다. 운영 DB에는 `baselineOnMigrate=true`, `baselineVersion=1`로 적용해 V1을 건너뛴다. 로컬과 Testcontainers에서는 V1부터 실행한다.
- `V2__polling_and_queue.sql`:
  ```sql
  -- 저장소별 진행 상태. 기존 행은 모두 분석이 끝난 행이므로 기본값은 COMPLETED.
  ALTER TABLE repositories
    ADD COLUMN status text NOT NULL DEFAULT 'COMPLETED',  -- PENDING|ANALYZING|COMPLETED|SKIPPED|FAILED
    ADD COLUMN position int NOT NULL DEFAULT 0,
    ADD COLUMN error_message text;

  -- 같은 프로필의 진행 중인 작업은 하나만 존재한다. Redis 락을 대신한다.
  CREATE UNIQUE INDEX analysis_jobs_active_profile_key
    ON analysis_jobs (github_profile)
    WHERE status IN ('PENDING', 'PROCESSING');

  -- 큐가 PENDING 작업을 오래된 순서로 찾는다.
  CREATE INDEX analysis_jobs_pending_idx
    ON analysis_jobs (created_at)
    WHERE status = 'PENDING';
  ```
- **V2 적용 전 확인**: 지금 DB에 `PENDING`/`PROCESSING`으로 멈춘 작업이 같은 프로필에 두 개 이상 있으면 unique index 생성이 실패한다. S-7에서 미리 조회해 `FAILED`로 정리한다.
- V2는 기존 Node 앱과도 호환된다. Node 앱은 `status`를 넣지 않으므로 기본값 `COMPLETED`가 들어가고, 이는 지금 의미(분석이 끝난 저장소만 행이 있음)와 같다. 그래서 전환 후 롤백할 때 DB를 되돌릴 필요가 없다.

### 저장소 행을 미리 만든다

- **이유**: polling 화면은 "총 N개 중 몇 개 완료, 지금 분석 중인 저장소, 건너뜀·실패한 저장소"를 DB만 보고 그려야 한다. 지금은 분석을 마친 저장소만 행이 생기고([repo-analysis.ts:220](../../services/analysis/repo-analysis.ts)), 건너뜀·실패는 이벤트로만 알려 저장되지 않는다. 그래서 지금도 새로고침하면 건너뜀·실패 표시가 사라진다.
- **변경**: pinned 저장소 목록을 받은 직후 모든 저장소를 `status=PENDING`, `position=순서`로 넣는다. 필요한 GitHub 메타데이터는 pinned 목록에 이미 있다(재사용 경로가 이미 이 값으로 행을 만든다, [orchestrator.ts:203](../../services/analysis/orchestrator.ts)). 분석을 시작하면 `ANALYZING`, 끝나면 `COMPLETED`/`SKIPPED`/`FAILED`로 바꾸고 실패 문구는 `error_message`에 남긴다.
- 0단계 문서에서 미뤄 둔 "일부 저장소 실패가 기록 없이 빠진 채 COMPLETED 처리됨" 문제도 여기서 기록은 남게 된다.
- **동작 변화 주의 (Q4)**: 리포트 재사용 판단에 쓰는 지문 `buildProfileFingerprint(previousJob.repositories)`([orchestrator.ts:150](../../services/analysis/orchestrator.ts))는 지금 "분석을 마친 저장소"만으로 만들어진다. 저장소 행을 전부 남기면 건너뛴 저장소까지 지문에 들어가 재사용 조건이 달라진다. 지금과 같게 하려면 이전 작업의 저장소를 `status = COMPLETED`로 걸러서 지문을 만든다. 저장소별 이전 분석 재사용(`previousAnalyses`)은 분석 행이 있는지 이미 확인하므로 그대로 둔다.

- **확인**: Testcontainers Postgres에서 V1 → V2가 적용되고, 엔티티로 읽고 쓸 때 배열·JSON·enum이 왕복된다.

## S-3. GitHub·LLM 클라이언트, 프롬프트, 응답 검증

- **GitHub 클라이언트** ([services/github-client.ts](../../services/github-client.ts), 449줄): `RestClient`로 옮긴다. REST와 GraphQL(pinned 저장소) 호출, 재시도와 대기, rate limit 경고 로그, `GitHubAPIError(statusCode, endpoint)`를 그대로 둔다. star 확인(`hasUserStarredRepository`)도 여기에 있다.
- **LLM 클라이언트** ([services/llm-client.ts](../../services/llm-client.ts)): 공식 `openai-java` SDK를 쓴다. 지금 설정을 그대로 옮긴다.
  - base URL, API key, model은 환경 변수로 받는다. 업체를 가정하지 않는다.
  - `temperature: 0.1`, `max_tokens: 16384`, `response_format: json_object`, 요청 타임아웃 120초(`LLM_REQUEST_TIMEOUT_MS`), SDK 재시도 2회
  - 프롬프트는 user 메시지 하나로 보낸다.
  - Spring AI는 쓰지 않는다. 추상화가 한 겹 늘고, OpenAI 호환 업체마다 다른 동작을 맞추기가 오히려 어렵다.
- **프롬프트** ([prompts/](../../prompts)): 템플릿 문자열을 `resources/prompts/*.txt`로 옮기고 값만 끼워 넣는다. 문구가 바뀌면 응답 품질이 달라지므로 한 글자도 바꾸지 않는다.
- **응답 검증** (zod → Java): [schemas/](../../schemas)의 세 스키마를 record와 Bean Validation 어노테이션으로 옮긴다. Jackson은 모르는 필드를 무시하게 한다(zod 기본 동작과 같음). 검증에 실패하면 지금처럼 재시도하거나 오류를 던진다.
- **커밋 필터** ([lib/commit-filter.ts](../../lib/commit-filter.ts)): Java 정규식으로 옮긴다. `\b` 동작이 JS와 같은지 0-8 테스트 사례로 확인한다.
- **에러 문구** ([lib/errors.ts](../../lib/errors.ts)의 `toUserMessage`): 사용자에게 보이는 문구를 그대로 옮긴다. 내부 에러 메시지는 화면에 보내지 않는다(O-4).
- **확인**: WireMock으로 GitHub·LLM 응답을 흉내 내 재시도, 오류 분류, JSON 검증 실패를 테스트한다.

## S-4. 분석 파이프라인과 DB 큐

### 큐

- `@Scheduled(fixedDelay = 1초)` 폴러가 빈 슬롯이 있을 때만 작업을 하나씩 집는다.
  ```sql
  UPDATE analysis_jobs SET status = 'PROCESSING', updated_at = now()
  WHERE id = (
    SELECT id FROM analysis_jobs
    WHERE status = 'PENDING'
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING id, github_profile;
  ```
- 집은 작업은 크기 3짜리 스레드풀(`MAX_CONCURRENT_ANALYSIS`)에서 실행한다. 지금의 BullMQ 워커 동시성 3과 같다.
- 재시도는 하지 않는다. 지금도 `attempts: 1`이다(0-4).
- **재시작 복구**: 앱이 뜰 때 `PROCESSING`인 작업을 `FAILED`("서버 재시작으로 분석이 중단되었습니다")로 바꾼다. 서버 한 대 가정이라서 가능한 방식이다. 지금은 워커가 죽으면 DB에 `PROCESSING`이 남고 Redis 락이 1시간 동안 같은 프로필을 막는데 이 문제도 사라진다.
- 배포할 때 진행 중이던 분석은 실패로 끝나므로 사용자는 다시 요청하면 된다. 이게 문제가 되면 graceful shutdown과 `stop_grace_period`를 늘리는 방법을 따로 검토한다.

### 파이프라인

- [orchestrator.ts](../../services/analysis/orchestrator.ts), [repo-analysis.ts](../../services/analysis/repo-analysis.ts), [profile-aggregation.ts](../../services/analysis/profile-aggregation.ts)를 서비스 클래스로 옮긴다. 순서와 규칙은 바꾸지 않는다.
  1. pinned 저장소 조회. 0개면 실패 처리
  2. 저장소 행을 `PENDING`으로 미리 생성 (S-2)
  3. 같은 프로필의 직전 `COMPLETED` 작업에서 저장소별 분석 재사용(`full_name`과 `updated_at`이 같을 때), 현재 목록에 없는 이전 저장소 행 삭제
  4. 나머지 저장소를 **순서대로 하나씩** 분석. 저장소 하나가 실패해도 계속 진행한다
  5. 지문이 같고 green/red flag가 있으면 프로필 리포트 재사용, 아니면 LLM으로 종합. 위젯 SVG 생성
  6. `COMPLETED` 기록. 실패하면 사용자 문구를 `error_message`에 넣고 `FAILED`
- `publishEvent` 호출은 모두 DB 상태 갱신으로 바뀐다. 이벤트별 대응:

  | 지금 이벤트 | 바뀐 뒤 |
  |---|---|
  | `stateChange`, `job_complete`, `job_failed` | `analysis_jobs.status`, `error_message` |
  | `repo_list` | 저장소 행 미리 생성 |
  | `repo_analysis_started` / `completed` / `skipped` / `failed` | `repositories.status`, `error_message` |
  | `aggregation_complete` | 저장소가 모두 끝났고 작업이 `PROCESSING`이면 화면이 "프로필 종합 중"으로 표시 |

- **타임아웃** (10분, `ANALYSIS_TIMEOUT_MS`): 작업을 `Future`로 돌리고 `get(timeout)`이 넘으면 취소 플래그를 세운다. 저장소 루프가 매 반복마다 플래그를 확인한다. 지금의 `timedOut` 변수와 같은 방식이다. 0단계에서 미뤄 둔 "타임아웃 뒤에도 작업이 계속 실행됨" 문제는 `Future.cancel(true)`의 인터럽트로 블로킹 HTTP 호출까지 끊을 수 있는지 함께 확인한다.
- **위젯 SVG** ([services/widget-export.ts](../../services/widget-export.ts)): Java text block으로 옮긴다. XML 이스케이프, 줄바꿈 길이, 최대 줄 수 규칙을 그대로 둔다. 기존 저장값과 새로 만든 SVG를 바이트 단위로 비교하는 테스트를 둔다.
- **확인**: Testcontainers Postgres와 가짜 GitHub·LLM 클라이언트로 정상, 재사용, 저장소 일부 실패, 전체 실패, 타임아웃, 재시작 복구를 테스트한다. 같은 프로필 작업이 동시에 두 개 실행되지 않는지도 확인한다.

## S-5. 화면과 엔드포인트

### 엔드포인트

| 지금 | 바뀐 뒤 | 비고 |
|---|---|---|
| `GET /` (`app/page.tsx`, `UrlInput.tsx`) | `GET /` | |
| `POST /api/analyze` (JSON) | `POST /analyze` (HTMX 폼) | 아래 "분석 요청" |
| `GET /analysis/{jobId}` | `GET /analysis/{jobId}` | 서버가 첫 화면을 진행 조각까지 포함해 렌더링한다 |
| `GET /api/analysis/{jobId}/events` (SSE) | `GET /analysis/{jobId}/progress` (HTML 조각) | polling 대상 |
| `GET /report/{jobId}` | `GET /report/{jobId}` | **URL 유지** |
| `GET /api/report/{jobId}` (JSON) | 없앰 | 리포트 화면의 클라이언트 재조회에만 쓰였다. 서버 렌더링으로 대체 |
| `GET /api/widget/{jobId}` | `GET /api/widget/{jobId}` | **URL, `theme` 파라미터, 헤더 유지** |
| `GET /api/report/{jobId}/pdf` | 없앰 | PDF 제외 |
| `GET /api/health` | `GET /api/health` | 경로 유지. DB 연결과 큐 폴러가 살아 있는지 본다. Redis·워커 수 확인은 빠진다 |

### 분석 요청 (메인 화면)

- 지금 [UrlInput.tsx](../../components/UrlInput.tsx)는 입력 → 검증 → star 안내 → 다시 검증을 React state로 관리한다. HTMX에서는 서버가 단계별 조각을 돌려준다.
- `POST /analyze`의 처리 순서는 [analyze/route.ts](../../app/api/analyze/route.ts)와 같다: URL 검증 → 프로필 존재 확인 → star 확인 → 작업 생성.
- **중복 방지**: `INSERT` 하나로 끝난다. partial unique index에 걸리면(같은 프로필이 진행 중) 그 작업 id를 조회해 그쪽 진행 화면으로 보낸다. jobId 선생성, `SET NX`, Lua 해제, 큐 등록 실패 시 락 해제 같은 0-6의 처리가 필요 없어진다. 큐 등록이 곧 `PENDING` 행 `INSERT`라서 둘이 어긋날 수 없다.
- **응답**:
  - 성공: `HX-Redirect: /analysis/{jobId}`
  - star 없음: star 안내와 "다시 검증" 버튼 조각
  - 프로필 없음, rate limit, 토큰 권한 문제, 내부 오류: 지금과 같은 문구의 오류 조각
- htmx는 기본적으로 4xx·5xx 응답을 화면에 넣지 않는다. 사용자에게 보여줄 오류 조각은 200으로 보내거나, `htmx.config.responseHandling`으로 4xx 조각도 넣게 설정한다. 둘 중 하나로 통일한다.

### 진행 화면 (polling)

- 진행 조각을 감싼 요소에 `hx-get="/analysis/{jobId}/progress" hx-trigger="every 2s" hx-swap="outerHTML"`를 단다.
- 조각 내용: 작업 상태, 저장소 목록(순서, 상태, 완료 요약, 실패 문구), "총 N개 중 M개", 모두 끝났으면 "프로필 종합 중".
- 끝났을 때:
  - `COMPLETED`: `HX-Redirect: /report/{jobId}`. 지금 [page.tsx:55](../../app/analysis/[jobId]/page.tsx)처럼 리포트로 이동한다.
  - `FAILED`: 실패 문구와 다시 시도 버튼 조각을 **HTTP 286**으로 보낸다. htmx는 286을 받으면 polling을 멈춘다.
- 첫 화면도 같은 조각 템플릿으로 서버가 렌더링하므로 새로고침이나 재접속 시 스냅샷을 따로 만들 필요가 없다. 지금 SSE 라우트의 "먼저 구독하고 상태를 읽는" 경쟁 조건 처리, 하트비트, 재연결이 모두 사라진다.
- 부하: polling 한 번에 쿼리 두 개(작업 하나, 저장소 목록)라서 지금 트래픽이면 2초 주기로 충분하다.

### 리포트 화면

- [ReportClient.tsx](../../app/report/[jobId]/ReportClient.tsx)를 Thymeleaf 템플릿으로 옮긴다. `job.status !== COMPLETED`이면 404 처리(0-7)를 유지한다.
- 상호작용은 작은 바닐라 JS 파일 하나로 처리한다. Alpine.js는 넣지 않는다.
  - 위젯 코드 모달: 네이티브 `<dialog>`
  - 강점 "더 보기": `<details>` 또는 클래스 토글
  - 위젯 라이트/다크 전환: 미리보기 `src`와 마크다운 코드 문자열 교체
  - 마크다운 복사: `navigator.clipboard.writeText`
- 마크다운 코드의 위젯 URL과 리포트 URL은 지금처럼 요청 origin으로 만든다. 서버 렌더링이므로 `ServletUriComponentsBuilder.fromCurrentContextPath()`로 만들고, 리버스 프록시 뒤라면 `server.forward-headers-strategy=framework`를 켠다.

### 오류 화면

- `app/error.tsx`, `app/not-found.tsx`, `app/analysis/[jobId]/error.tsx`를 `templates/error/404.html`, `5xx.html`로 옮긴다.

- **확인**: MockMvc로 각 엔드포인트의 상태 코드, `HX-Redirect`, 286, 조각 내용을 테스트한다. 브라우저에서 메인 → star 안내 → 진행 → 리포트 → 위젯 복사까지 한 번 직접 확인한다.

## S-6. 테스트

- 도구: JUnit 5, AssertJ, Mockito, Testcontainers(Postgres), WireMock(GitHub·LLM HTTP), MockMvc.
- GitHub Actions의 ubuntu 러너에는 Docker가 있으므로 Testcontainers가 돈다.
- 기존 Jest 테스트를 줄 단위로 옮기지 않고 [동작 체크리스트](#동작-체크리스트)를 기준으로 쓴다. SSE 관련(`sse.test.ts`, `sse-snapshot.test.ts`), Redis·큐 관련(`cache.test.ts`, `queue.test.ts`, `analysis-worker.test.ts`), PDF(`pdf-export.test.ts`), Next 빌드 확인(`infrastructure/setup.test.ts`)은 대상이 사라지므로 옮기지 않는다. polling 조각과 DB 큐 테스트를 새로 쓴다.

## S-7. 배포 파이프라인 교체와 운영 전환

### 이미지와 CI

- **Dockerfile**: 빌드 단계는 JDK 이미지에서 Tailwind standalone CLI와 `./gradlew bootJar`를 실행한다. 실행 단계는 Temurin JRE ARM64 이미지에 jar 하나를 둔다. Chromium, Node, Prisma 엔진이 빠진다.
- **JVM 메모리**: `-XX:MaxRAMPercentage`로 힙 상한을 잡고, compose에 `mem_limit`를 둔다. 값은 Q5 결과로 정한다.
- **CI** ([deploy.yml](../../.github/workflows/deploy.yml)): test 잡을 `setup-java` + `./gradlew test`로 바꾼다. build·deploy 잡은 그대로 둔다(ARM 러너, GHCR, Tailscale SSH).
- **compose**: 서비스는 `app` 하나만 남긴다. `worker`, `redis`, `redis_data` 볼륨을 지운다. 로그 로테이션과 `restart: unless-stopped`는 유지한다. 컨테이너 이름이 바뀌면 Alloy 수집 설정(O-5)도 함께 맞춘다.

### 전환 절차

1. 서버 `.env`에 `SPRING_DATASOURCE_URL`, `_USERNAME`, `_PASSWORD`를 추가한다(S-1). 기존 변수는 롤백을 위해 남겨 둔다.
2. 운영 DB에서 같은 프로필에 진행 중인 작업이 여럿인지 조회하고, 멈춘 `PENDING`/`PROCESSING` 작업을 `FAILED`로 정리한다(V2의 unique index 생성 조건).
3. `main`에 머지한다. 배포 워크플로가 새 이미지를 올리고 `docker compose up -d`를 실행한다. Spring이 뜨면서 Flyway V2가 적용된다.
4. 확인: `/api/health`, 기존에 만들어진 `/report/{jobId}`와 `/api/widget/{jobId}?theme=dark` 몇 개, 새 분석 한 건(재사용 경로와 새 분석 경로 모두).
5. 이상이 없으면 Redis 컨테이너와 볼륨을 지운다(`docker compose down`에서 빠진 서비스는 남아 있을 수 있다. `docker compose up -d --remove-orphans`).

### 롤백

- 머지 커밋을 revert해 다시 배포한다. 이전 compose(Node 앱, 워커, Redis)와 이미지가 돌아온다.
- V2 스키마 변경은 Node 앱과 호환되므로 DB는 되돌리지 않는다(S-2).

## S-8. Node 코드 제거, 문서 갱신

- Node 관련 파일을 지운다: `app/`, `components/`, `lib/`, `services/`, `prompts/`, `schemas/`, `workers/`, `types/`, `tests/`, `prisma/`, `package*.json`, `tsconfig*`, `next.config.ts`, `jest.config.js`, `eslint.config.mjs`, `postcss.config.mjs`, `public/`의 Next 기본 아이콘.
- 문서를 현재 구조로 고친다: [ARCHITECTURE.md](../ARCHITECTURE.md)(3절 Background Job), [DEVELOPMENT.md](../DEVELOPMENT.md), [ROADMAP.md](../ROADMAP.md)("향후 변경 예정"의 SSE 항목), [docs/CLAUDE.md](../CLAUDE.md), [observability-plan.md](observability-plan.md)(pino·Redis 언급).
- 6단계(수동 재시도)는 이 구조에서 "같은 프로필로 새 `PENDING` 작업 만들기"로 단순해진다. 마이그레이션이 끝난 뒤 진행한다.

---

## 동작 체크리스트

S-0에서 기존 테스트를 보고 채운다. 아래는 코드에서 확인한 항목이고, 빠진 것을 더한다.

**분석 요청**
- [ ] 잘못된 URL은 400, 없는 프로필은 404, star가 없으면 403과 안내 문구
- [ ] GitHub rate limit은 429와 `Retry-After: 60`, 토큰 권한 문제는 502와 정해진 문구
- [ ] 같은 프로필을 동시에 두 번 요청하면 작업은 하나만 생기고 둘 다 같은 jobId를 받는다
- [ ] 끝난 작업이 있는 프로필을 다시 요청하면 새 작업이 생긴다
- [ ] 내부 오류는 정해진 문구만 보내고 상세는 로그로 남긴다

**파이프라인**
- [ ] pinned 저장소 0개면 `FAILED`, 실패 처리는 한 번만
- [ ] 저장소는 순서대로 하나씩 분석하고, 하나가 실패해도 나머지는 계속한다
- [ ] 필터 후 커밋이 0개면 `SKIPPED`
- [ ] `full_name`과 `updated_at`이 같은 저장소는 이전 분석을 재사용한다
- [ ] 현재 pinned 목록에 없는 이전 저장소 행은 삭제한다
- [ ] 지문이 같고 green/red flag가 있으면 프로필 리포트를 재사용한다
- [ ] 프로필 종합이 실패하면 대체 리포트를 저장하지 않는다(0-7)
- [ ] 10분 타임아웃이면 `FAILED`이고 그 뒤 단계로 넘어가지 않는다
- [ ] 동시에 실행되는 분석은 최대 3개
- [ ] 재시작 시 `PROCESSING` 작업이 `FAILED`가 된다 (새 동작)

**조회**
- [ ] `COMPLETED`가 아닌 작업의 리포트와 위젯은 404
- [ ] 위젯은 저장된 SVG를 우선 쓰고, 없으면 만들어서 돌려준다. `theme` 파라미터와 `Cache-Control: public, max-age=300, stale-while-revalidate=86400` 유지
- [ ] 진행 조각: 새로고침해도 같은 내용, 완료 시 리포트로 이동, 실패 시 286과 실패 문구

**클라이언트 로직**
- [ ] 커밋 필터의 통과·제외 사례(0-8)
- [ ] LLM 응답 JSON 검증 실패, 재시도, 타임아웃
- [ ] GitHub 호출 재시도와 오류 분류
- [ ] 로그에 토큰·API 키가 남지 않는다
