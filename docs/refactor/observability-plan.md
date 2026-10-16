# 관측 가능성: 로그·메트릭·업타임 계획

리팩터링 순서(0 → 6)와 별도로 진행하는 작업이다. 운영 서버에서 서비스가 살아 있는지, 분석이 왜 실패했는지, 자원을 얼마나 쓰는지를 SSH 없이 볼 수 있게 만든다.

## 시작 시점의 상태

- 서버 한 대에서 docker compose로 `next-app`, `worker`(BullMQ), `redis`를 띄운다. DB는 외부 Supabase Postgres다.
- 서버 코드에 로그가 한 줄도 없었다. `console.*`는 브라우저에서 도는 `error.tsx` 두 곳뿐이었다.
- 헬스체크 엔드포인트, 컨테이너 재시작 정책, Docker 로그 로테이션이 없었다.
- 분석 실패 원인은 DB의 `analysis_jobs.error_message`로만 알 수 있었다.

## 결정된 사항

- 로그는 pino로 stdout에 JSON 한 줄씩 쓴다. 수집은 앱이 아니라 수집기(Grafana Alloy)가 Docker 로그를 읽어서 한다.
- 로그 줄마다 고정된 `event` 이름을 붙인다(`job.failed`, `repo.failed`, `llm.call` 등). 앱 메트릭은 처음에는 따로 만들지 않고 이 이벤트로 로그에서 뽑는다.
- `jobId`, `repo`는 JSON 본문에만 넣는다. Loki 레이블은 컨테이너 이름과 `level` 정도로 둔다. 값이 계속 늘어나는 필드를 레이블로 쓰면 Loki가 느려지고 무료 한도를 넘긴다.
- 로그 저장·대시보드·알림은 Grafana Cloud 무료 플랜을 쓴다. 계정과 토큰은 사용자가 만든다.
- 남기지 않는 것: 토큰·API 키·DB 비밀번호, LLM 프롬프트(README와 커밋 메시지가 들어 있어 남의 비밀값이 섞일 수 있다), LLM 원본 응답(길이만 남긴다).
- 마스킹은 두 겹이다. 필드 경로로 가리는 pino `redact`와, 에러 메시지·스택에서 `ghp_`·`github_pat_`·`sk-`·`Bearer`·URL 안 비밀번호를 지우는 `scrubSecrets`다. 둘 다 [lib/logger.ts](../../lib/logger.ts)에 있다.

## 진행 방식

- `main` 체크아웃에서 작업한다. `main`에 push하면 배포 워크플로가 테스트 → 이미지 빌드 → 배포 순서로 돈다.
- 커밋 규칙: 작업 하나당 커밋 하나. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- 확인 기준: 커밋마다 `npx jest`, `npx tsc --noEmit -p tsconfig.json`, `npx tsc --noEmit -p tsconfig.worker.json`을 실행한다. 기준선은 300개 전부 통과다(`af48034` 기준).

| # | 작업 | 상태 |
|---|---|---|
| O-1 | 헬스체크 엔드포인트, 재시작 정책, 로그 로테이션 | 완료 `a62d1df` |
| O-2 | pino 로거, 워커·작업 생명주기 로그 | 완료 `01a7aca` |
| O-3 | GitHub·LLM 클라이언트 로그 | 완료 `b1f9198` |
| O-4 | API 500 처리와 사용자에게 보이는 내부 에러 정리 | 대기 |
| O-5 | Alloy로 Grafana Cloud에 로그 보내기 | 대기 (사용자: Grafana Cloud 계정) |
| O-6 | 인프라 메트릭 수집 | 대기 |
| O-7 | 업타임 체크 등록 | 대기 (사용자) |
| O-8 | 로그 기반 대시보드와 알림 | 대기 |

---

## O-1. 헬스체크 엔드포인트, 재시작 정책, 로그 로테이션

- [app/api/health/route.ts](../../app/api/health/route.ts): Redis `PING`, DB `SELECT 1`, BullMQ 워커 연결 수를 확인한다. 모두 정상이면 200, 하나라도 실패하면 503을 돌려준다. 확인 하나당 3초 제한을 둔다.
- [docker-compose.yml](../../docker-compose.yml): 세 서비스에 `restart: unless-stopped`와 json-file 로그 로테이션(10MB × 3개)을 넣었다.
- 운영 서버에서 `/api/health` 응답은 아직 직접 확인하지 못했다.

## O-2. pino 로거, 워커·작업 생명주기 로그

- [lib/logger.ts](../../lib/logger.ts): `level`은 문자열(`"info"`)로, `time`은 ISO 형식으로 쓴다. pid와 hostname은 수집기가 컨테이너 이름을 붙이므로 뺐다. `LOG_LEVEL`로 수준을 바꾸고 테스트에서는 기본값이 `silent`다.
- 에러는 커스텀 에러의 필드(`statusCode`, `endpoint`, `phase`)를 그대로 남긴다. `LLMAPIError.rawResponse`는 `rawResponseLength`로 바꾼다.
- 남기는 이벤트:

| event | 위치 | 수준 | 주요 필드 |
|---|---|---|---|
| `worker.started`, `worker.stopping` | [workers/index.ts](../../workers/index.ts) | info | `concurrency`, `signal` |
| `process.unhandled_rejection`, `process.uncaught_exception` | 같은 파일 | fatal | `err`. 기록 후 종료해 컨테이너 재시작에 맡긴다 |
| `worker.error` | [analysis-worker.ts](../../workers/analysis-worker.ts) | error | `err` |
| `job.stalled` | 같은 파일 | warn | `jobId` |
| `job.started` | [orchestrator.ts](../../services/analysis/orchestrator.ts) | info | `jobId`, `username` |
| `job.completed` | 같은 파일 | info | `durationMs`, `repos`(total·reused·completed·skipped·failed), `profileReused` |
| `job.failed` | 같은 파일 | error | `durationMs`, `repos`, `err`. 정리 작업 전에 남겨 원래 에러가 가려지지 않게 한다 |
| `repo.completed`, `repo.skipped`, `repo.failed` | [repo-analysis.ts](../../services/analysis/repo-analysis.ts) | info, info, warn | `jobId`, `repo`, `durationMs`, `commitCount`, `err` |

## O-3. GitHub·LLM 클라이언트 로그

외부 API 실패가 분석 실패 원인의 대부분이다. 최종 실패는 위의 `repo.failed`, `job.failed`에 `err`로 남으므로 여기서는 그 앞 단계를 남긴다.

### GitHub ([services/github-client.ts](../../services/github-client.ts))

- `github.retry`(warn): 재시도할 때마다 `endpoint`, `status`, `attempt`, `delayMs`, `rateLimitRemaining`. REST와 GraphQL 둘 다 남긴다.
- `github.rate_limit_low`(warn): 응답 헤더의 `x-ratelimit-remaining`이 100 미만일 때 `remaining`, `endpoint`. 한도는 시간당 5,000이라 이 로그가 찍히면 곧 분석이 막힌다는 뜻이다.

### LLM ([services/llm-client.ts](../../services/llm-client.ts))

- `llm.call`(info): 응답을 받을 때마다 `kind`(`repository` 또는 `profile`), `model`, `durationMs`, `finishReason`, `promptTokens`, `completionTokens`, `totalTokens`. 지금은 `completion.usage`를 버리고 있어서 비용을 볼 방법이 없다.
- `llm.invalid_response`(warn): JSON 파싱이나 Zod 검증이 실패해 다시 시도할 때 `kind`, `attempt`, `reason`, `rawResponseLength`, `finishReason`. `finishReason`이 `length`이면 `max_tokens`에 걸려 응답이 잘렸다는 뜻이다.
- 프롬프트와 응답 본문은 남기지 않는다.

### 확인

- 각 이벤트가 맞는 필드로 찍히는지 테스트한다. 로거를 mock해서 호출 인자를 본다.
- 기존 `github-client`, `llm-client` 테스트가 그대로 통과해야 한다.

## O-4. API 500 처리와 사용자에게 보이는 내부 에러 정리

지금은 내부 에러 메시지가 사용자 화면까지 간다.

- [analyze/route.ts](../../app/api/analyze/route.ts), [verify-star/route.ts](../../app/api/verify-star/route.ts): 500 응답에 `error.message`를 그대로 넣는다. DB 호스트나 `REDIS_URL environment variable is not set` 같은 내용이 보일 수 있다.
- [orchestrator.ts](../../services/analysis/orchestrator.ts): 원본 에러 메시지를 SSE로 보내고 `error_message`에 저장한다. [events/route.ts](../../app/api/analysis/[jobId]/events/route.ts)가 그 값을 다시 보낸다.
- [profile-aggregation.ts](../../services/analysis/profile-aggregation.ts): LLM 원본 응답 500자를 에러 메시지에 붙인다. 이 값이 진행 화면에 그대로 나온다.

고치는 방향: 상세 내용은 서버 로그에만 남기고 사용자에게는 정해진 문구를 보낸다. 라우트의 500은 `api.error` 이벤트로 남긴다. GitHub 토큰 권한 문제(502)는 운영자가 고쳐야 하므로 error로 남긴다. `error_message` 컬럼에 무엇을 저장할지(사용자용 문구인지 상세 내용인지)는 작업 전에 정한다.

## O-5. Alloy로 Grafana Cloud에 로그 보내기

- 사용자가 Grafana Cloud 스택을 만들고 Loki·Prometheus 주소와 토큰을 서버 `.env`에 넣는다.
- [docker-compose.yml](../../docker-compose.yml)에 `grafana/alloy` 서비스를 추가한다. Docker 소켓은 읽기 전용으로 마운트한다. 소켓에 접근하는 컨테이너에는 사실상 호스트 권한이 있으므로 공식 이미지만 쓴다.
- `config.alloy`: `discovery.docker` → `loki.source.docker` → `loki.write`. 레이블은 컨테이너 이름과 `level`만 붙인다.
- 확인: Grafana Explore에서 `{container="worker"} | json | event="job.started"`로 분석 하나가 보이는지 본다.

## O-6. 인프라 메트릭 수집

- 같은 Alloy 설정에 `prometheus.exporter.unix`(서버 CPU·메모리·디스크)와 `prometheus.exporter.cadvisor`(컨테이너별 사용량)를 추가하고 `prometheus.remote_write`로 보낸다.
- 확인: Grafana에서 컨테이너별 메모리 그래프가 나오는지 본다.

## O-7. 업타임 체크 등록

- 서버 밖에서 `/api/health`를 1~5분마다 호출하고 실패하면 알린다. Grafana Cloud Synthetic Monitoring을 쓰면 알림을 한곳에서 관리할 수 있다. UptimeRobot도 된다.
- 사용자가 등록한다.

## O-8. 로그 기반 대시보드와 알림

- 대시보드: 시간당 `job.completed`·`job.failed` 건수(성공률), `job.completed`의 `durationMs` 분포, `llm.call`의 토큰 합계, `repo.failed` 원인별 건수.
- 알림: `job.failed`가 연속으로 나올 때, `github.rate_limit_low`, 업타임 실패, 디스크 사용량 90% 이상.

---

## 이 계획에서 하지 않는 것

| 항목 | 이유 |
|---|---|
| SSE 라우트의 빈 `catch`에 로그 추가 | 5단계에서 SSE를 지운다 |
| 타임아웃 이후 작업 실제 취소 | 5단계(`AbortController`). 루프 사이에 플래그를 확인해 다음 단계로 넘어가지 않게 하는 수정은 `af48034`로 넣었다. 5단계 계획과 겹치므로 그때 같이 정리한다 |
| `prom-client`로 앱 메트릭 엔드포인트 추가 | 로그 이벤트로 먼저 본다. 실시간 큐 길이처럼 로그로 알 수 없는 값이 필요해지면 한다 |
| 요청 접근 로그 | Next standalone은 접근 로그가 없다. 서버 앞에 리버스 프록시가 있으면 그 로그를 쓴다. 프록시 구성을 확인한 뒤 정한다 |
| Redis 연결 끊김·재연결 로그 | ioredis 클라이언트가 네 곳에서 따로 생긴다. 연결을 정리할 때 같이 한다 |
| 브라우저 에러 수집 | 서버 로그 범위 밖이다 |
| OpenAI SDK 내부 재시도 로그 | SDK의 logger 인터페이스가 pino와 달라 어댑터가 필요하다. `llm.call`의 `durationMs`로 먼저 본다 |

## 함께 발견한 것

- [docker-compose.yml](../../docker-compose.yml)에서 Redis `6379` 포트가 비밀번호 없이 호스트에 열려 있다. 앱은 컨테이너 네트워크로 접속하므로 `ports`를 지워도 동작에는 영향이 없다.
