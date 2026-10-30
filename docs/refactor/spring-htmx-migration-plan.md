# Spring Boot + HTMX 마이그레이션 계획

Next.js(React) + BullMQ + Redis 구조를 Spring Boot + Thymeleaf + HTMX로 옮기는 계획이다. 진행 상황은 SSE 대신 polling으로 보여주고, Redis를 없애 Postgres만으로 운영한다.
리팩터링 순서(0 → 6)의 5단계("SSE 제거, polling 도입, Redis와 BullMQ는 큐 용도로 유지")를 대신한다. BullMQ를 유지하기로 했던 건 Node 스택이 전제였는데, Spring으로 옮기면 BullMQ를 쓸 수 없어서 그 전제가 사라진다.
줄 번호는 `main`의 커밋 `c51159d` 기준이다.

## 결정된 사항

- 백엔드는 Spring Boot, 화면은 Thymeleaf 템플릿과 HTMX로 만든다. React와 Next.js는 쓰지 않는다.
- 코드는 항상 Controller → Service → Repository 3계층으로 나눈다. Controller는 요청·응답과 화면 조각 선택만 맡고 비즈니스 규칙과 트랜잭션은 Service에, DB 접근은 Repository에 둔다. Controller가 Repository를 직접 부르지 않는다.
- DB 접근은 Spring Data JPA를 적극적으로 쓴다. 파생 쿼리 메서드와 `@Query`로 먼저 해결하고 JPA로 표현하기 어려운 쿼리(S-4의 큐 SQL 등)도 Repository의 `@Query(nativeQuery = true)`로 둔다.
- Lombok을 적극적으로 쓴다. 생성자 주입은 `@RequiredArgsConstructor`, getter는 `@Getter`, 로거는 `@Slf4j`로 만든다. 엔티티에는 `@Data`와 `@Setter`를 쓰지 않는다. `@Data`가 만드는 `equals`·`hashCode`·`toString`이 지연 로딩 연관을 건드리기 때문이다.
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

## 디렉터리 구조

[2026-spring-team2](https://github.com/jdk829355/2026-spring-team2)의 구조를 따른다. 최상위 패키지를 도메인으로 나누고 도메인 안을 다시 계층(`controller`, `service`, `repository` 등)으로 나눈다. 외부 API 클라이언트와 공통 설정은 `global` 아래에 둔다.

```text
build.gradle
settings.gradle
deploy/
  docker-compose.yml
src/main/java/{base}/
  …Application.java
  global/
    common/          공통 상수
    config/          RestClient, 분석 스레드풀, 스케줄링 설정
    exception/       GlobalExceptionHandler, 사용자 문구 변환(toUserMessage)
    filter/          요청 로그
    logging/         로그 마스킹(LogMembersCustomizer, SecretScrubber)
    util/            커밋 필터, 문자열 자르기
    github/          GitHub 클라이언트 (dto/, exception/, service/)
    llm/             LLM 클라이언트 (dto/, exception/, prompt/, service/)
    health/          /api/health
  analysis/
    controller/      메인 화면, POST /analyze, 진행 화면과 progress 조각
    dto/request/
    dto/response/
    exception/       StarRequiredException
    entity/          AnalysisJob, Repo, RepoAnalysis
    enums/           AnalysisJobStatus, RepoStatus
    repository/      AnalysisJobRepository, RepoRepository, RepoAnalysisRepository
    service/         분석 요청(star 확인, 작업 생성), 파이프라인, 저장소 분석
    scheduler/       PENDING 작업을 집는 폴러
  report/
    controller/      /report/{jobId}, /api/widget/{jobId}
    dto/response/
    entity/          ProfileReport
    repository/      ProfileReportRepository
    service/         프로필 종합, 리포트 조회, 위젯 SVG 생성
src/main/resources/
  application.yml
  application-prod.yml
  db/migration/      Flyway V1, V2
  prompts/           LLM 프롬프트
  templates/         analysis/, report/, error/
  static/            js/(htmx, 리포트 화면 스크립트), css/
src/test/java/{base}/  main과 같은 패키지 구조 (도메인별 controller/, service/, repository/)
src/test/resources/
  golden/prompts/    Node 앱이 만든 프롬프트 출력 (S-3)
```

- 도메인 사이의 호출은 Service끼리만 한다. 예를 들어 분석 파이프라인은 프로필 종합을 `report`의 Service에 맡긴다.
- `repositories` 테이블의 엔티티는 `Repo`(`@Table(name = "repositories")`)로 짓는다. `Repository`로 지으면 Spring Data의 `Repository` 인터페이스와 이름이 겹치고 리포지토리 인터페이스 이름이 `RepositoryRepository`가 된다.
- `pdf_exports`는 PDF를 빼므로 엔티티를 만들지 않는다.

## 사용자가 정할 것

| # | 질문 | 추천 |
|---|---|---|
| Q1 | 코드를 어디서 개발하나 | 결정: 별도 워크트리에서 브랜치 `refactor/spring-migration`으로 개발한다. 메인 저장소는 `main`에 두고 운영 중인 Node 앱을 고치는 데 쓴다. Spring 프로젝트는 `server/` 디렉터리에 만든다. 전환(S-7)에서는 `server/`를 그대로 두고 배포 설정만 바꾼다. Node 코드 삭제와 루트 이동은 S-8에서 한다 |
| Q2 | Java 버전 | 결정: 25. Spring Boot 4.1.2, Hibernate 7.4, Lombok 1.18.48과 함께 빌드와 테스트가 문제없이 돈다 |
| Q3 | 전환할 때 몇 분 정도 서비스가 멈춰도 되나 | 결정: 된다고 보고 진행한다. 안 된다면 S-7 절차를 다시 짠다 |
| Q4 | 프로필 리포트 재사용 조건을 그대로 둘까 | 결정: 그대로 둔다. S-4에서 이전 작업의 저장소를 `status = COMPLETED`로 걸러 지문을 만든다(S-2 "동작 변화 주의") |
| Q5 | 서버 메모리 여유 | 결정: 서버 메모리는 3.7GiB이고 Node 앱이 도는 지금 여유(available)가 2.4GiB다. compose `mem_limit: 1g`, `-XX:MaxRAMPercentage=70`(힙 약 700MB)으로 둔다 |
| Q6 | 최상위 패키지 이름(`{base}`) | 결정: `pinnedsignal`. DB 스키마 이름과 같다 |

## 진행 방식

- 확인 기준: 기존 Node 쪽은 지금 기준선(Jest 300개 전부 통과)을 유지한다. Spring 쪽은 커밋마다 `./gradlew test`가 통과해야 한다.
- 전환(S-7) 전까지 운영은 계속 Node 앱이 맡는다. DB 스키마 변경은 전환 때 한 번에 적용한다.

| # | 작업 | 예상 | 상태 |
|---|---|---|---|
| S-0 | 기존 동작 목록 정리, 결정 확정 | 0.5일 | 완료 (Q5는 S-7 전에 사용자가 확인) |
| S-1 | Spring 프로젝트 골격 | 1일 | 완료 `2580d75` |
| S-2 | DB 계층과 스키마 변경 | 1.5일 | 완료 `c2e9652` |
| S-3 | GitHub·LLM 클라이언트, 프롬프트, 응답 검증 | 2~3일 | 완료 `d1cbb7a` |
| S-4 | 분석 파이프라인과 DB 큐 | 2~3일 | 완료 `9a60ec2` |
| S-5 | 화면과 엔드포인트 (Thymeleaf + HTMX) | 3~4일 | 완료 `ae03a82` |
| S-6 | 테스트 | 3~4일 (S-1~S-5와 함께) | 완료 |
| S-7 | 배포 파이프라인 교체와 운영 전환 | 1~2일 | 진행 중 (배포 설정 완료, 운영 전환 대기) |
| S-8 | Node 코드 제거, 루트로 이동, 문서 갱신 | 0.5일 | 대기 |

합계는 약 2.5~3주다. 가장 큰 위험은 S-4의 파이프라인 동작(재사용 규칙, 타임아웃, 실패 처리)을 지금과 똑같이 맞추는 일이다.

---

## S-0. 기존 동작 목록 정리

- Jest 테스트 300개에서 "지켜야 하는 동작"을 뽑아 이 문서 끝의 [동작 체크리스트](#동작-체크리스트)를 채운다. 테스트를 1:1로 옮기지 않고 이 목록을 기준으로 새로 쓴다.
- Q2~Q6을 정한다.
- **결과**: Jest 테스트 제목과 본문을 보고 동작 체크리스트를 채웠다. 대상이 사라지는 테스트(SSE, Redis 락, BullMQ, PDF, Next 빌드)는 체크리스트에 넣지 않았다. S-3에서 확인한 항목에는 표시를 했다.

## S-1. Spring 프로젝트 골격

- **구성**: Gradle(Groovy, `build.gradle`), Spring Boot 최신 안정판, `spring-boot-starter-web`, `-thymeleaf`, `-data-jpa`, `-validation`, `-actuator`, Flyway, PostgreSQL 드라이버, Lombok.
- **정적 파일**: HTMX 2.x를 `static/js/`에 버전을 고정해 직접 넣는다(CDN 안 씀). Tailwind v4는 standalone CLI로 빌드한다. 입력은 [app/globals.css](../../app/globals.css)를 옮긴 파일, 스캔 대상은 `templates/**/*.html`이다. 빌드에 Node가 필요 없다.
- **설정**: 환경 변수 이름을 그대로 쓴다(`GITHUB_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). [lib/config.ts](../../lib/config.ts)처럼 없으면 부팅이 실패하게 한다. `REDIS_URL`은 없애고 `NEXT_PUBLIC_APP_URL`은 서버 코드 어디에서도 읽지 않으므로 함께 없앤다.
- **DB 연결**: Prisma의 `DATABASE_URL`(`postgresql://user:pass@host/db?schema=...`)은 JDBC 형식이 아니다. `SPRING_DATASOURCE_URL`(`jdbc:postgresql://host/db?currentSchema=pinnedsignal`), `_USERNAME`, `_PASSWORD` 세 개로 나눈다. 서버 `.env`는 S-7에서 바꾼다.
- **커넥션 풀**: Hikari `maximum-pool-size`를 5 안팎으로 작게 둔다. Supabase 세션 모드 풀이 15개이고, polling과 워커 3개가 같은 풀을 쓴다.
- **로그**: Spring Boot 내장 구조화 로그(`logging.structured.format.console`)로 stdout에 JSON을 한 줄씩 쓴다. [observability-plan](observability-plan.md)의 규칙을 그대로 지킨다.
  - `event` 이름을 지금과 같게 쓴다(`job.started`, `job.completed`, `job.failed`, `repo.*`, `llm.call`, `api.error` 등).
  - 비밀값 마스킹(필드 경로 `redact`와 `scrubSecrets` 패턴)을 옮긴다. 원본은 [lib/logger.ts](../../lib/logger.ts)다.
  - LLM 프롬프트와 원본 응답은 남기지 않는다.
- **확인**: `./gradlew bootRun`으로 빈 페이지가 뜨고 Tailwind 클래스가 적용된다.
- **결과** (`2580d75`)
  - Spring Boot 4부터 스타터가 기능별로 나뉘었다. 계획의 `-web` 대신 `spring-boot-starter-webmvc`를 쓰고, Flyway 자동 설정은 `spring-boot-starter-flyway`, `RestClient.Builder`는 `spring-boot-starter-restclient`(S-3에서 추가)가 있어야 생긴다.
  - 로그는 Spring Boot 내장 `logstash` 형식으로 쓴다. 처음에는 pino와 같은 필드 이름을 맞추려고 직접 만든 포매터(`PinoJsonFormatter`)를 썼는데, 내장 형식으로 충분해서 지웠다. 필드는 SLF4J fluent API의 `addKeyValue`나 MDC로 넘기고 예외는 `setCause`로 넘긴다. `LogMembersCustomizer`를 `logging.structured.json.customizer`로 꽂아 `LoggableException`의 필드(`statusCode`, `endpoint` 등)를 `err` 아래에 남기고 필드 이름 마스킹과 `SecretScrubber`로 비밀값을 지운다. 마스킹은 `message`와 `stack_trace`를 포함해 모든 문자열에 적용된다.
  - 필드 이름이 pino와 달라진다. `time`은 `@timestamp`(시간대 오프셋 포함), `msg`는 `message`가 되고 `level`은 이름은 같지만 값이 대문자(`INFO`)다. 예외는 `err.type`·`message`·`stack` 대신 `stack_trace` 문자열로 나온다. `event`와 직접 넘긴 필드는 최상위에 그대로 남는다. 그래서 운영 전환 전에 수집기 설정의 `level` 레이블 값과 Grafana 쿼리의 `level="error"` 같은 조건을 `ERROR`에 맞춰 고쳐야 한다.
  - 필수 환경 변수는 `@Validated` 설정 record로 받는다. 비어 있으면 Node 앱과 같은 문구(`GITHUB_TOKEN environment variable is not set`)로 부팅이 멈춘다.
  - Tailwind는 Gradle 작업이 standalone CLI(4.3.3)를 `server/.tailwind/`에 내려받아 빌드한다. HTMX는 `static/js/htmx-2.0.11.min.js`로 넣었다.
  - 로컬 Postgres 컨테이너에 붙여 `./gradlew bootRun`을 실행해 메인 화면과 Tailwind 클래스를 확인했다.
  - `application-prod.yml`과 요청 로그 필터는 아직 만들지 않았다. 지금 쓸 설정이 없고 Node 앱에도 요청 로그가 없어서 필요해지는 S-5·S-7에서 만든다.

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
- 여기서는 "일부 저장소 실패가 기록 없이 빠진 채 COMPLETED 처리됨" 문제도 기록은 남는다.
- **동작 변화 주의 (Q4)**: 리포트 재사용 판단에 쓰는 지문 `buildProfileFingerprint(previousJob.repositories)`([orchestrator.ts:150](../../services/analysis/orchestrator.ts))는 지금 "분석을 마친 저장소"만으로 만들어진다. 저장소 행을 전부 남기면 건너뛴 저장소까지 지문에 들어가 재사용 조건이 달라진다. 지금과 같게 하려면 이전 작업의 저장소를 `status = COMPLETED`로 걸러서 지문을 만든다. 저장소별 이전 분석 재사용(`previousAnalyses`)은 분석 행이 있는지 이미 확인하므로 그대로 둔다.

- **확인**: Testcontainers Postgres에서 V1 → V2가 적용되고, 엔티티로 읽고 쓸 때 배열·JSON·enum이 왕복된다.
- **결과** (`c2e9652`)
  - V1은 `prisma migrate diff --from-empty`로 만든 DDL이다. `pg_dump` 대신 이 방법을 쓰고 운영 DB의 `information_schema`·`pg_indexes`·`pg_constraint`와 읽기 전용으로 대조해 컬럼, 기본값, 인덱스, 외래 키가 모두 같음을 확인했다. 운영 DB는 PostgreSQL 17.6이라 Testcontainers도 `postgres:17-alpine`을 쓴다.
  - 시각 컬럼은 `timestamp(3)`(시간대 없음)에 Prisma가 UTC로 넣은 값이다. `Instant`로 매핑하고 `hibernate.type.preferred_instant_jdbc_type=TIMESTAMP`, `hibernate.jdbc.time_zone=UTC`를 켰다. Node 앱이 넣은 형태의 행을 SQL로 넣고 같은 시각으로 읽히는지 테스트한다.
  - `status`는 `@JdbcTypeCode(SqlTypes.NAMED_ENUM)`으로 매핑했다. 계획에 적은 `PostgreSQLEnumJdbcType`과 같은 일을 하는 Hibernate 7의 방식이다.
  - 새 ID는 `@UuidGenerator`로 만든다. 엔티티 사이의 컬렉션(`@OneToMany`)은 두지 않고 Repository 조회 메서드로 대신한다.
  - 테스트: V1 → V2 적용, `ddl-auto=validate`로 엔티티와 스키마 일치, 배열·JSON·enum·시각 왕복, 같은 프로필의 진행 중 작업 두 개 거부, 끝난 작업이 있으면 새 작업 허용.

## S-3. GitHub·LLM 클라이언트, 프롬프트, 응답 검증

- **GitHub 클라이언트** ([services/github-client.ts](../../services/github-client.ts), 449줄): `RestClient`로 옮긴다. REST와 GraphQL(pinned 저장소) 호출, 재시도와 대기, rate limit 경고 로그, `GitHubAPIError(statusCode, endpoint)`를 그대로 둔다. star 확인(`hasUserStarredRepository`)도 여기에 있다.
- **LLM 클라이언트** ([services/llm-client.ts](../../services/llm-client.ts)): 공식 `openai-java` SDK를 쓴다. 지금 설정을 그대로 옮긴다.
  - base URL, API key, model은 환경 변수로 받는다. 업체를 가정하지 않는다.
  - `temperature: 0.1`, `max_tokens: 16384`, `response_format: json_object`, 요청 타임아웃 120초(`LLM_REQUEST_TIMEOUT_MS`), SDK 재시도 2회
  - 프롬프트는 user 메시지 하나로 보낸다.
  - Spring AI는 쓰지 않는다. 추상화가 한 겹 늘고, OpenAI 호환 업체마다 다른 동작을 맞추기가 오히려 어렵다.
- **프롬프트** ([prompts/](../../prompts)): 템플릿 문자열을 `resources/prompts/*.txt`로 옮기고 값만 끼워 넣는다. 문구가 바뀌면 응답 품질이 달라지므로 한 글자도 바꾸지 않는다.
- **응답 검증** (zod → Java): [schemas/](../../schemas)의 세 스키마를 record와 Bean Validation 어노테이션으로 옮긴다. Jackson은 모르는 필드를 무시하게 한다(zod 기본 동작과 같음). 검증에 실패하면 지금처럼 재시도하거나 오류를 던진다.
- **커밋 필터** ([lib/commit-filter.ts](../../lib/commit-filter.ts)): Java 정규식으로 옮긴다. `\b` 동작이 JS와 같은지 [tests/lib/commit-filter.test.ts](../../tests/lib/commit-filter.test.ts)의 사례로 확인한다.
- **에러 문구** ([lib/errors.ts](../../lib/errors.ts)의 `toUserMessage`): 사용자에게 보이는 문구를 그대로 옮긴다. 내부 에러 메시지는 화면에 보내지 않는다(O-4).
- **확인**: WireMock으로 GitHub·LLM 응답을 흉내 내 재시도, 오류 분류, JSON 검증 실패를 테스트한다.
- **결과** (`d1cbb7a`)
  - GitHub 클라이언트는 `RestClient.exchange`로 상태 코드와 헤더를 직접 보고 재시도 규칙(500·502·503, 남은 한도 0인 403, 최대 3회, 100·200·400ms)을 그대로 옮겼다. 재시도 대기는 `Sleeper`로 분리해 테스트에서 실제로 기다리지 않는다. 대기 중 인터럽트되면 작업을 멈춘다(S-4 타임아웃에서 쓴다).
  - LLM 클라이언트는 `openai-java` 4.94.0을 쓴다. `max_tokens`는 SDK에서 deprecated지만 지금처럼 그대로 보낸다. OpenAI 호환 업체 중 `max_completion_tokens`를 모르는 곳이 있기 때문이다. SDK 오류는 지금처럼 상태 코드 유지, 타임아웃 408, 연결 실패 503으로 바꾼다.
  - 응답 검증은 Jackson 기본 동작이 zod보다 느슨해서 따로 맞췄다. Jackson은 숫자를 문자열로, `"0.5"`를 숫자로 바꿔 받는데 zod는 거부한다. LLM 응답용 `JsonMapper`에서 이 타입 변환을 막고 뒤에 붙은 내용도 거부하게 했다.
  - 프롬프트는 고정 문구를 `resources/prompts/*.txt`에 두고 `{{userPrompt}}` 자리에 사용자 입력 부분을 넣는다. 같은 입력으로 Node 코드가 만든 출력을 골든 파일(`test/resources/golden/prompts/`)로 저장해 두고 바이트 단위로 비교한다.
  - 커밋 필터는 JS와 Java 정규식이 다른 두 곳을 맞췄다. JS의 `$`는 끝 줄바꿈 앞에서 맞지 않으므로 `\z`로 쓰고, JS의 `\s`는 유니코드 공백을 포함하므로 같은 범위의 문자 클래스로 바꿨다. `\b`는 Java 19부터 JS처럼 ASCII 기준이라 그대로 둔다. 한글이 붙은 경우(`merge한`, `docs수정`)는 Node에서 결과를 확인하고 테스트에 넣었다.
  - 계획과 달라진 점: `schemas/github-url-request.ts`와 `normalizeGitHubUrl`은 분석 요청 화면에서만 쓰므로 S-5로 넘긴다. GitHub 요청에는 지금처럼 타임아웃을 두지 않았다. S-4에서 인터럽트로 끊기는지 확인할 때 함께 정한다.
  - 테스트는 157개이고 모두 통과한다.

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
- 재시도는 하지 않는다. 지금도 `attempts: 1`이다.
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

- **타임아웃** (10분, `ANALYSIS_TIMEOUT_MS`): 작업을 `Future`로 돌리고 `get(timeout)`이 넘으면 취소 플래그를 세운다. 저장소 루프가 매 반복마다 플래그를 확인한다. 지금의 `timedOut` 변수와 같은 방식이다. "타임아웃 뒤에도 작업이 계속 실행됨" 문제는 `Future.cancel(true)`의 인터럽트로 블로킹 HTTP 호출까지 끊을 수 있는지 함께 확인한다.
- **위젯 SVG** ([services/widget-export.ts](../../services/widget-export.ts)): Java text block으로 옮긴다. XML 이스케이프, 줄바꿈 길이, 최대 줄 수 규칙을 그대로 둔다. 기존 저장값과 새로 만든 SVG를 바이트 단위로 비교하는 테스트를 둔다.
- **확인**: Testcontainers Postgres와 가짜 GitHub·LLM 클라이언트로 정상, 재사용, 저장소 일부 실패, 전체 실패, 타임아웃, 재시작 복구를 테스트한다. 같은 프로필 작업이 동시에 두 개 실행되지 않는지도 확인한다.
- **결과** (`9a60ec2`)
  - 큐 SQL은 계획대로 `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id`다. `updated_at`은 `timestamp(3)`(시간대 없음)에 UTC로 넣어야 해서 `now()` 대신 `now() AT TIME ZONE 'UTC'`를 쓴다. 다른 트랜잭션이 잡고 있는 작업을 건너뛰는지는 테스트로 확인했다.
  - 폴러는 1초마다 돌면서 빈 슬롯이 있는 동안 작업을 하나씩 집는다. 슬롯은 `Semaphore`(3개)로 센다. 실행기와 타임아웃 감시기는 `AnalysisJobRunner`가 직접 만든다. 감시기를 빈으로 두면 Spring Boot의 기본 스케줄러가 물러나 폴러가 감시기와 스레드를 나눠 쓰게 되기 때문이다.
  - 재시작 복구는 `SmartInitializingSingleton`으로 한다. 스케줄러는 컨텍스트 초기화가 끝난 뒤에 시작하므로 복구가 폴러보다 먼저 끝난다. `ApplicationReadyEvent`로 하면 폴러가 방금 집은 작업을 복구가 FAILED로 바꿀 수 있다.
  - 타임아웃은 계획과 조금 다르다. 작업마다 `Future.get(timeout)`으로 기다리는 스레드를 두는 대신, 감시 스레드 하나가 10분 뒤 취소 플래그를 세우고 `Future.cancel(true)`로 작업 스레드를 인터럽트한다. 파이프라인은 저장소 사이, 프로필 종합 전, 완료 기록 전에 플래그를 보고 FAILED로 끝낸다. 인터럽트 플래그가 남아 있으면 Hikari가 연결을 주지 않으므로 FAILED를 쓰기 전에 플래그를 지운다.
  - **인터럽트 확인 결과**: GitHub 호출(JDK HttpClient)은 인터럽트로 바로 끊긴다. 그래서 GitHub 요청에 타임아웃을 따로 두지 않았다. LLM 호출(OkHttp)은 인터럽트로 끊기지 않는다. 호출 하나는 요청 타임아웃 120초에 끝나지만 SDK 재시도 2회까지 더하면 최대 6분쯤 걸린다. 그동안은 슬롯도 비지 않으므로 10분을 넘긴 작업이 FAILED가 되는 시점이 최대 6분 늦어질 수 있다.
  - 저장소 분석은 pinned 목록에서 받은 메타데이터를 그대로 쓴다. 지금은 저장소마다 사용자 저장소 목록을 다시 받는데 미리 만든 `repositories` 행에 이미 같은 값이 있어서 이 요청을 뺐다.
  - 건너뛴 저장소는 `error_message` 없이 `SKIPPED`만 남긴다. 화면에 보일 문구는 S-5에서 정한다.
  - 재사용 지문은 계획대로 이전 작업의 `COMPLETED` 저장소만으로 만든다. 이전에 건너뛴 저장소가 있으면 리포트는 새로 만들고 분석이 있는 저장소의 분석은 재사용한다. 프로필 종합에 넘기는 저장소도 `COMPLETED`만이다.
  - 진행 상태 기록은 `AnalysisProgressService`의 짧은 트랜잭션으로 나눴다. 화면이 polling하므로 파이프라인 전체를 한 트랜잭션으로 묶지 않는다. `RepoAnalysis` 삭제는 파생 메서드 대신 벌크 `@Query`로 둔다. 파생 삭제는 flush가 늦어져 `repositories`를 먼저 지울 때 외래 키에 걸렸다.
  - 위젯 SVG는 Node가 만든 출력을 골든 파일로 저장해 바이트 단위로 비교한다. 입력 4건(일반, 빈 값, 특수문자, 공백·마침표 경계)을 `cases.json`에 두고 `services/widget-export.ts`로 출력을 만들었다. JS의 `\s`와 `trim`에 맞추려고 `TextUtils`에 `JS_WHITESPACE`, `collapseWhitespace`, `splitWords`를 두었고 `CommitFilter`도 이 상수를 쓴다.
  - 같은 프로필 작업이 동시에 두 개 실행되지 않는 것은 S-2의 partial unique index 테스트가 확인한다. 컨텍스트를 띄우는 테스트는 `analysis.polling.enabled=false`로 폴러를 끈다.
  - 테스트는 191개이고 모두 통과한다.

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
- **중복 방지**: `INSERT` 하나로 끝난다. partial unique index에 걸리면(같은 프로필이 진행 중) 그 작업 id를 조회해 그쪽 진행 화면으로 보낸다. jobId 선생성, `SET NX`, Lua 해제, 큐 등록 실패 시 락 해제 같은 처리가 필요 없어진다. 큐 등록이 곧 `PENDING` 행 `INSERT`라서 둘이 어긋날 수 없다.
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

- [ReportClient.tsx](../../app/report/[jobId]/ReportClient.tsx)를 Thymeleaf 템플릿으로 옮긴다. `job.status !== COMPLETED`이면 404 처리를 유지한다.
- 상호작용은 작은 바닐라 JS 파일 하나로 처리한다. Alpine.js는 넣지 않는다.
  - 위젯 코드 모달: 네이티브 `<dialog>`
  - 강점 "더 보기": `<details>` 또는 클래스 토글
  - 위젯 라이트/다크 전환: 미리보기 `src`와 마크다운 코드 문자열 교체
  - 마크다운 복사: `navigator.clipboard.writeText`
- 마크다운 코드의 위젯 URL과 리포트 URL은 지금처럼 요청 origin으로 만든다. 서버 렌더링이므로 `ServletUriComponentsBuilder.fromCurrentContextPath()`로 만들고, 리버스 프록시 뒤라면 `server.forward-headers-strategy=framework`를 켠다.

### 오류 화면

- `app/error.tsx`, `app/not-found.tsx`, `app/analysis/[jobId]/error.tsx`를 `templates/error/404.html`, `5xx.html`로 옮긴다.

- **확인**: MockMvc로 각 엔드포인트의 상태 코드, `HX-Redirect`, 286, 조각 내용을 테스트한다. 브라우저에서 메인 → star 안내 → 진행 → 리포트 → 위젯 복사까지 한 번 직접 확인한다.
- **결과** (`ae03a82`)
  - 엔드포인트는 위 표대로 만들었다. 분석 요청은 `AnalyzeController`, 진행 화면은 `AnalysisProgressController`, 리포트와 위젯은 `report` 도메인 컨트롤러가 맡는다. 화면이 읽는 쪽은 `AnalysisQueryService`로 두어 상태를 쓰는 `AnalysisProgressService`와 나눴다. `report`는 `analysis`의 Repository를 직접 부르지 않고 이 서비스를 거친다.
  - 오류 조각은 `htmx-config`의 `responseHandling`으로 4xx·5xx도 화면에 넣게 해서 상태 코드(400, 403, 404, 429, 502, 500)를 그대로 보낸다. 다만 polling 요소는 `hx-on::before-swap`으로 5xx 응답을 무시하고 다음 주기에 다시 요청한다. DB가 잠깐 끊겨도 진행 화면이 오류 페이지로 바뀌지 않는다.
  - 중복 방지는 `INSERT`가 partial unique index에 걸리면 진행 중인 작업을 조회하는 방식이다. 같은 프로필을 동시에 두 번 요청하는 테스트로 작업이 하나만 생기는 것을 확인했다.
  - star 안내의 "검증 후 분석" 버튼과 실패 화면의 "다시 시도" 버튼은 프로필 URL을 hidden 입력으로 들고 `/analyze`를 다시 부른다. 그래서 "다시 시도"는 6단계(수동 재시도)를 기다리지 않고 새 `PENDING` 작업을 만든다. 안내를 보고 다시 눌렀는데 또 star가 없으면 `confirm=true` 파라미터를 보고 "아직 star가 확인되지 않았습니다" 문구를 더한다.
  - 입력 검증 문구는 Node 클라이언트 화면에 있던 "GitHub 프로필 URL을 입력해주세요", "올바른 GitHub 프로필 URL을 입력해주세요"를 쓴다. 정규화는 `GitHubUrls`로 옮겼고 `tests/lib/utils.test.ts`의 사례를 포함한다. 프로필 없음, rate limit, 토큰 권한(502, `api.error` 로그), 내부 오류는 Node 앱과 같은 문구다.
  - 진행 화면의 첫 응답과 polling 응답은 같은 조각 템플릿이다. 건너뛴 저장소에는 "분석할 커밋이 없어 건너뛰었습니다."를 보여준다. 이미 끝난 작업의 `/analysis/{jobId}`는 리포트로 302 이동하고 조각 요청은 `HX-Redirect`를 보낸다.
  - 리포트의 "Pin된 저장소" 카드에는 분석이 끝난(`COMPLETED`) 저장소만 나온다. 지금 화면과 같다. 위젯 대화상자는 네이티브 `<dialog>`이고 강점 더 보기·테마 전환·복사는 `report.js` 하나가 맡는다.
  - 위젯은 저장된 SVG가 현재 버전(`inner-card-v4`)이면 그대로 쓰고 아니면 다시 만들어 저장한다. 경로, `theme` 파라미터, `Cache-Control`은 같다. `Content-Type`은 Tomcat이 `;` 뒤 공백을 지워서 `image/svg+xml;charset=utf-8`로 나간다. 미디어 타입은 같아서 그대로 뒀다.
  - `/api/health`는 DB 쿼리와 폴러의 마지막 poll 시각(60초 안)을 본다. 확인마다 3초 제한이 있고 하나라도 실패하면 503이다. 폴러는 큐가 비어 있어도 매 주기에 시각을 갱신한다.
  - 오류 화면은 `GlobalExceptionHandler`가 `error/404`, `error/5xx`로 보낸다. 400이나 405 같은 요청 오류는 Spring이 원래 상태 코드로 처리하도록 넘긴다. 5xx 화면의 "Try Again" 버튼은 새로고침 대신 메인 화면 링크로 바꿨다. `favicon.ico`는 `app/`에서 `static/`으로 복사했다.
  - 계획과 달라진 점: `analysis/exception/`(`StarRequiredException`)을 디렉터리 구조에 더했다.
  - **브라우저 확인**: 가짜 GitHub·LLM 서버와 Postgres 컨테이너에 앱을 붙여 메인 → star 안내 → "아직 star가 확인되지 않았습니다" → star 후 재검증 → 진행(polling) → 리포트 자동 이동 → 위젯 대화상자(테마 전환, 미리보기, 복사)까지 확인했다. 이 과정에서 "검증 후 분석" 버튼의 로딩 표시가 안 보이는 문제를 찾아 고쳤다.
  - 테스트는 293개이고 모두 통과한다. 컨트롤러는 MockMvc 슬라이스 테스트로, 서비스는 Testcontainers로 확인했고 `AnalysisWebFlowTest`가 요청 → 큐 → 진행 → 리포트 → 위젯을 실제 컨텍스트에서 한 번에 훑는다.

## S-6. 테스트

- 도구: JUnit 5, AssertJ, Mockito, Testcontainers(Postgres), WireMock(GitHub·LLM HTTP), MockMvc.
- GitHub Actions의 ubuntu 러너에는 Docker가 있으므로 Testcontainers가 돈다.
- 기존 Jest 테스트를 줄 단위로 옮기지 않고 [동작 체크리스트](#동작-체크리스트)를 기준으로 쓴다. SSE 관련(`sse.test.ts`, `sse-snapshot.test.ts`), Redis·큐 관련(`cache.test.ts`, `queue.test.ts`, `analysis-worker.test.ts`), PDF(`pdf-export.test.ts`), Next 빌드 확인(`infrastructure/setup.test.ts`)은 대상이 사라지므로 옮기지 않는다. polling 조각과 DB 큐 테스트를 새로 쓴다.
- **결과**
  - S-1~S-5에서 도구(JUnit 5, AssertJ, Mockito, Testcontainers, WireMock, MockMvc)와 테스트가 이미 갖춰져서 S-6에서 새로 쓴 테스트는 없다. 대신 [동작 체크리스트](#동작-체크리스트)의 모든 항목에 대응하는 테스트가 있는지 하나씩 대조했고 빠진 항목은 없었다.
  - 대조한 결과는 이렇다. 분석 요청은 `AnalyzeControllerTest`와 `AnalysisRequestServiceTest`, 파이프라인은 `AnalysisPipelineServiceTest`, `AnalysisJobRunnerTest`, `AnalysisQueueServiceTest`가 맡는다. 조회는 `AnalysisProgressControllerTest`, `ReportControllerTest`, `WidgetControllerTest`, `HealthControllerTest`, 클라이언트 로직과 로그는 `GitHubClientTest`, `LlmClientTest`, `CommitFilterTest`, `PinoJsonFormatterTest`, `SecretScrubberTest`가 맡는다.
  - 캐시를 쓰지 않고 `./gradlew cleanTest test`로 다시 돌렸더니 293개가 모두 통과했다(실패 0, 건너뜀 0). Testcontainers가 Docker를 쓰므로 로컬에서도 Docker가 떠 있어야 하고 빌드는 JDK 25 툴체인으로 돈다.
  - 대상이 사라지는 Jest 테스트(SSE, Redis·큐, PDF, Next 빌드)는 계획대로 옮기지 않았다. CI의 test 잡을 `./gradlew test`로 바꾸는 일은 S-7에서 한다.

## S-7. 배포 파이프라인 교체와 운영 전환

### 이미지와 CI

- **Dockerfile**: 빌드 단계는 JDK 이미지에서 Tailwind standalone CLI와 `./gradlew bootJar`를 실행한다. 실행 단계는 Temurin JRE ARM64 이미지에 jar 하나를 둔다. Chromium, Node, Prisma 엔진이 빠진다.
- **JVM 메모리**: `-XX:MaxRAMPercentage`로 힙 상한을 잡고, compose에 `mem_limit`를 둔다. 값은 Q5 결과로 정한다.
- **CI** ([deploy.yml](../../.github/workflows/deploy.yml)): test 잡을 `setup-java` + `./gradlew test`로 바꾼다. build·deploy 잡은 그대로 둔다(ARM 러너, GHCR, Tailscale SSH).
- **compose**: 서비스는 `app` 하나만 남긴다. `worker`, `redis`, `redis_data` 볼륨을 지운다. 로그 로테이션과 `restart: unless-stopped`는 유지한다. 컨테이너 이름이 바뀌면 Alloy 수집 설정(O-5)도 함께 맞춘다. 파일은 `deploy/docker-compose.yml`로 옮기고 배포 스크립트의 `docker compose` 명령에 `-f deploy/docker-compose.yml`을 준다.
- **결과** (배포 설정)
  - `server/Dockerfile`은 `eclipse-temurin:25-jdk`에서 `./gradlew bootJar`로 jar를 만들고 `eclipse-temurin:25-jre`에서 `app` 사용자로 실행한다. Tailwind standalone CLI가 glibc 바이너리라서 alpine 이미지는 쓰지 않는다. CLI는 Gradle 작업이 빌드 중에 내려받는다. 빌드 컨텍스트가 `server/`로 바뀌어 루트의 Node용 `Dockerfile`과 `.dockerignore`는 지웠다.
  - 메모리는 Q5에 따라 `mem_limit: 1g`, `-XX:MaxRAMPercentage=70`으로 두었다. 로컬에서 768MB 한도로 띄웠을 때 기동 직후 컨테이너 메모리는 약 400MB였다. 전환하면 Node 앱, 워커, Redis가 빠지므로 서버의 여유 메모리는 지금보다 늘어난다.
  - 컨테이너 안에서는 Spring 기본 포트 8080으로 듣고 compose가 `3000:8080`으로 연결한다. 바깥 포트가 그대로라 리버스 프록시 설정은 바꾸지 않는다.
  - compose 파일을 `deploy/`로 옮기면 Compose가 `deploy/`를 프로젝트 디렉터리로 본다. 그러면 프로젝트 이름이 `deploy`가 되고 루트의 `.env`도 읽지 않는다. 그래서 배포 스크립트는 `docker compose --project-directory . -f deploy/docker-compose.yml`로 실행한다. 서버에서 compose 명령을 직접 칠 때도 같은 옵션을 줘야 한다.
  - 서비스 이름이 `next-app`에서 `app`으로 바뀌면 예전 `next-app` 컨테이너가 3000번 포트를 쥔 채 남아 새 컨테이너가 뜨지 못한다. 그래서 배포 스크립트의 `up -d`에 `--remove-orphans`를 붙였다. 첫 배포 때 `worker`와 `redis` 컨테이너도 함께 지워지고 `redis_data` 볼륨은 남는다.
  - CI test 잡은 `setup-java`(Temurin 25)와 `gradle/actions/setup-gradle`로 `server/`에서 `./gradlew test`를 돌린다. build 잡은 컨텍스트만 `server`로 바꿨다.
  - 확인: 이미지를 로컬에서 빌드하고 로컬 Postgres에 붙여 띄웠다. `/api/health`는 200(`database`, `poller` 모두 ok), 메인 화면과 `/css/app.css`도 200이었고 로그는 모두 JSON 한 줄이었다. `./gradlew test`는 295개가 모두 통과한다.
  - 수집기(O-5)는 아직 없어서 `level` 값이나 컨테이너 이름에 맞춰 고칠 설정도 없다. O-5를 할 때 `level` 값이 `ERROR`처럼 대문자이고 컨테이너 이름이 `github_repo_analysis-app-1`이라는 점을 반영한다.

### 전환 절차

1. 서버 `.env`(저장소 루트)에 `SPRING_DATASOURCE_URL`, `_USERNAME`, `_PASSWORD`를 추가한다(S-1). URL은 기존 `DATABASE_URL`의 호스트, 포트, DB 이름으로 `jdbc:postgresql://{host}:{port}/{db}?currentSchema=pinnedsignal`처럼 만들고 사용자와 비밀번호는 따로 넣는다. 기존 변수는 롤백을 위해 남겨 둔다.
2. 운영 DB에서 같은 프로필에 진행 중인 작업이 여럿인지 조회하고 멈춘 `PENDING`/`PROCESSING` 작업을 `FAILED`로 정리한다(V2의 unique index 생성 조건). 분석 하나는 10분 안에 끝나므로 1시간 넘게 갱신되지 않은 작업을 멈춘 것으로 본다.
   ```sql
   -- 결과가 없어야 V2의 unique index가 만들어진다.
   SELECT github_profile, count(*) FROM pinnedsignal.analysis_jobs
   WHERE status IN ('PENDING', 'PROCESSING')
   GROUP BY github_profile HAVING count(*) > 1;

   UPDATE pinnedsignal.analysis_jobs
   SET status = 'FAILED', error_message = '서버 재시작으로 분석이 중단되었습니다',
       updated_at = now() AT TIME ZONE 'UTC'
   WHERE status IN ('PENDING', 'PROCESSING')
     AND updated_at < now() AT TIME ZONE 'UTC' - interval '1 hour';
   ```
3. `main`에 머지한다. 배포 워크플로가 새 이미지를 올리고 `docker compose up -d`를 실행한다. Spring이 뜨면서 Flyway V2가 적용된다.
4. 확인: `/api/health`, 기존에 만들어진 `/report/{jobId}`와 `/api/widget/{jobId}?theme=dark` 몇 개, 새 분석 한 건(재사용 경로와 새 분석 경로 모두).
5. 이상이 없으면 Redis 볼륨을 지운다(`docker volume rm github_repo_analysis_redis_data`). Redis 컨테이너는 배포 스크립트의 `--remove-orphans`가 이미 지웠다.

### 롤백

- 머지 커밋을 revert해 다시 배포한다. 이전 compose(Node 앱, 워커, Redis)와 이미지가 돌아온다.
- 되돌린 워크플로는 `--remove-orphans` 없이 `docker compose up -d`를 실행한다. 그러면 Spring `app` 컨테이너가 3000번 포트를 쥔 채 남아 `next-app`이 뜨지 못하므로, 되돌린 커밋을 배포하기 전에 서버에서 `docker compose --project-directory . -f deploy/docker-compose.yml down`으로 Spring 컨테이너를 내린다.
- V2 스키마 변경은 Node 앱과 호환되므로 DB는 되돌리지 않는다(S-2).

## S-8. Node 코드 제거, 문서 갱신

- Node 관련 파일을 지운다: `app/`, `components/`, `lib/`, `services/`, `prompts/`, `schemas/`, `workers/`, `types/`, `tests/`, `prisma/`, `package*.json`, `tsconfig*`, `next.config.ts`, `jest.config.js`, `eslint.config.mjs`, `postcss.config.mjs`, `public/`의 Next 기본 아이콘.
- `server/`의 내용을 루트로 올리고 CI의 `working-directory`와 build 컨텍스트를 루트 기준으로 고친다.
- 문서를 현재 구조로 고친다: [ARCHITECTURE.md](../ARCHITECTURE.md)(3절 Background Job), [DEVELOPMENT.md](../DEVELOPMENT.md), [ROADMAP.md](../ROADMAP.md)("향후 변경 예정"의 SSE 항목), [docs/CLAUDE.md](../CLAUDE.md), [observability-plan.md](observability-plan.md)(pino·Redis 언급).
- 6단계(수동 재시도)는 이 구조에서 "같은 프로필로 새 `PENDING` 작업 만들기"로 단순해진다. 마이그레이션이 끝난 뒤 진행한다.

---

## 동작 체크리스트

S-0에서 기존 테스트를 보고 채운다. 아래는 코드에서 확인한 항목이고, 빠진 것을 더한다.

**분석 요청**
- [x] 잘못된 URL은 400, 없는 프로필은 404, star가 없으면 403과 안내 문구
- [x] GitHub rate limit은 429와 `Retry-After: 60`, 토큰 권한 문제는 502와 정해진 문구
- [x] 같은 프로필을 동시에 두 번 요청하면 작업은 하나만 생기고 둘 다 같은 jobId를 받는다
- [x] 끝난 작업이 있는 프로필을 다시 요청하면 새 작업이 생긴다
- [x] 내부 오류는 정해진 문구만 보내고 상세는 로그로 남긴다
- [x] GitHub 5xx는 500과 정해진 문구, 대소문자와 상관없이 "rate limit"이 들어간 메시지(보조 한도 포함)는 429
- [x] 큐 등록이나 DB 저장이 실패하면 다음 요청이 새 작업을 만들 수 있다 (DB 큐에서는 `INSERT` 하나라서 자연히 지켜진다)

**파이프라인**
- [x] pinned 저장소 0개면 `FAILED`, 실패 처리는 한 번만
- [x] 저장소는 순서대로 하나씩 분석하고, 하나가 실패해도 나머지는 계속한다
- [x] 필터 후 커밋이 0개면 `SKIPPED`
- [x] `full_name`과 `updated_at`이 같은 저장소는 이전 분석을 재사용한다
- [x] 현재 pinned 목록에 없는 이전 저장소 행은 삭제한다
- [x] 지문이 같고 green/red flag가 있으면 프로필 리포트를 재사용한다
- [x] 프로필 종합이 실패하면 대체 리포트를 저장하지 않는다
- [x] 10분 타임아웃이면 `FAILED`이고 그 뒤 단계로 넘어가지 않는다
- [x] 동시에 실행되는 분석은 최대 3개
- [x] 재시작 시 `PROCESSING` 작업이 `FAILED`가 된다 (새 동작)
- [x] README가 없으면(404) README 없이 분석한다. 다른 README 오류는 저장소 실패다
- [x] 저장소 실패 문구는 `toUserMessage`로 바꿔 저장하고 원본은 `repo.failed` 로그에만 남긴다
- [x] 저장소 행이 없거나 요약이 빈 분석만 있으면 "no eligible repositories"로 `FAILED`
- [x] 이전 리포트에 green/red flag가 없으면 프로필 리포트를 새로 만든다
- [x] 프로필 종합이 실패해도 LLM 원본 응답은 화면과 DB에 나가지 않는다
- [x] 위젯 SVG는 표시 크기만 줄이고 원래 좌표계를 유지한다

**조회**
- [x] `COMPLETED`가 아닌 작업의 리포트와 위젯은 404
- [x] 위젯은 저장된 SVG를 우선 쓰고, 없으면 만들어서 돌려준다. `theme` 파라미터와 `Cache-Control: public, max-age=300, stale-while-revalidate=86400` 유지
- [x] 진행 조각: 새로고침해도 같은 내용, 완료 시 리포트로 이동, 실패 시 286과 실패 문구
- [x] `/api/health`는 DB가 응답하지 않거나 확인 하나가 제한 시간을 넘기면 503

**클라이언트 로직**
- [x] 커밋 필터의 통과·제외 사례(`tests/lib/commit-filter.test.ts`)
- [x] LLM 응답 JSON 검증 실패, 재시도, 타임아웃
- [x] GitHub 호출 재시도와 오류 분류
- [x] 로그에 토큰·API 키가 남지 않는다
- [x] GitHub: `/users/{name}`의 404는 "Profile not found", 그 밖의 오류는 응답 본문의 `message`(없으면 `HTTP {status}`)
- [x] GitHub: 500·502·503과 남은 한도가 0인 403만 재시도하고 재시도마다 `github.retry`, 남은 한도가 100 미만이면 `github.rate_limit_low`
- [x] GitHub: GraphQL `errors`는 400으로 바로 실패, `data`가 없으면 500으로 재시도
- [x] GitHub: star 확인은 100개씩 넘기며 `owner/repo`를 대소문자 무시하고 정확히 비교한다
- [x] GitHub: 저장소 목록은 fork·archived·빈 저장소를 빼고 최대 50개, 커밋은 작성자 기준 최대 300개, README는 base64를 풀어 10KB로 자른다
- [x] LLM: 요청 옵션(`temperature` 0.1, `max_tokens` 16384, `json_object`, user 메시지 하나)
- [x] LLM: SDK 오류는 앱에서 다시 시도하지 않는다. HTTP 오류는 상태 코드 유지, 타임아웃 408, 연결 실패 503
- [x] LLM: `llm.call`에 kind·model·finishReason·토큰 수, `llm.invalid_response`에는 응답 길이만 남긴다
- [x] 프롬프트 문구가 Node 앱과 한 글자도 다르지 않다
- [x] 로그: JSON 한 줄, `level` 문자열, ISO 시각, pid·hostname 없음, LLM 원본 응답은 길이만
- [x] 로그: 토큰·API 키·비밀번호·프롬프트 필드는 가리고 에러 메시지와 스택에서 `ghp_`·`github_pat_`·`sk-`·`Bearer`·URL 비밀번호를 지운다
