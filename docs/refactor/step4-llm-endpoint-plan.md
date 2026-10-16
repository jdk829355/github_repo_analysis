# 4단계: LLM 호출을 OpenAI 호환 endpoint로 전환

리팩터링 순서(0 → 6) 중 4단계 작업 계획이다. 0~3단계는 끝났다.
`services/llm-client.ts`가 Gemini SDK 대신 OpenAI 호환 API를 쓰도록 바꾼다. 호출하는 쪽(`repo-analysis`, `profile-aggregation`, `orchestrator`)은 `analyzeRepository`, `aggregateProfile` 두 함수만 쓰므로 그대로 둔다.

## 결정된 사항

- 코드는 업체를 가정하지 않는 OpenAI 호환 클라이언트로 만들고 base URL·API key·model을 환경 변수로 받는다.
- JSON 응답은 `response_format: { type: 'json_object' }`로 받고 검증은 지금처럼 Zod로 한다. `json_schema` strict는 쓰지 않는다.
- LLM 호출 1회의 타임아웃을 전체 분석 타임아웃(`ANALYSIS_TIMEOUT_MS`, 10분)과 분리한다.
- SDK는 `openai` 6.x를 쓴다. 7.x는 Node 22 이상을 요구하는데 Docker 이미지가 `node:20-alpine`이다.

## 진행 방식

- 브랜치: `refactor/step4-llm-endpoint` (main에서 분기)
- 커밋 규칙: 작업 하나당 커밋 하나.
- 확인 기준: 커밋마다 `npx jest` 실행. 기준선은 251개 중 244개 통과, 7개 실패다. 실패 7개는 모두 이번 작업 전부터 있었다.
  - `tests/infrastructure/setup.test.ts` 4개: `.env.example` 없음(`.gitignore`의 `.env*`에 걸림), `docker` 디렉터리 없음, `next build`
  - `tests/api/sse.test.ts` 3개: 5단계에서 SSE와 함께 삭제 예정
- 이보다 나빠지면 안 된다.

| # | 작업 | 상태 |
|---|---|---|
| 4-1 | 환경 변수와 config 교체 | 완료 |
| 4-2 | 의존성 교체 | 완료 |
| 4-3 | `llm-client.ts`를 OpenAI 호환으로 다시 작성 | 완료 |
| 4-4 | 문서 갱신 | 완료 |
| 4-5 | 실제 endpoint로 확인 | 일부 완료 |

4-1~4-4는 끝났고 브랜치는 `main`에 머지했다. 4-5는 일부만 확인했다. 로컬 `.env`에 `LLM_*`를 넣고 pinned repository 4개를 분석해 작업이 `COMPLETED`로 끝나는 것까지 봤다. 이때 3개는 이전 결과를 재사용했고 1개는 실제 endpoint로 분석했고(약 12초) 프로필 종합도 새로 호출했다(약 17초). 두 응답 모두 Zod 검증을 통과했다. 아직 확인하지 못한 것은 `max_tokens: 16384`가 모델 제한 안에 있는지, 2분 타임아웃이 적당한지(재사용 없이 repository 여러 개를 새로 분석할 때), 리포트·PDF·위젯이 이전과 같이 나오는지다. 배포 순서 1~4도 남아 있다.

---

## 4-1. 환경 변수와 config 교체

- **변경**: `GEMINI_API_KEY`를 지우고 다음 세 개를 추가한다. 셋 다 필수이며 기본값은 두지 않는다. 다른 환경 변수와 같이 없으면 바로 오류를 낸다.
  ```env
  LLM_BASE_URL=   # 예: https://api.deepseek.com
  LLM_API_KEY=
  LLM_MODEL=
  ```
- **수정**:
  - [lib/config.ts](../../lib/config.ts): `getGeminiApiKey`를 지우고 `getLlmBaseUrl`, `getLlmApiKey`, `getLlmModel`을 추가한다.
  - [docker-compose.yml](../../docker-compose.yml): `next-app`, `worker` 두 서비스의 `GEMINI_API_KEY`를 세 변수로 바꾼다.
- **확인**:
  - `tests/lib/config.test.ts`의 `getGeminiApiKey` 테스트를 새 함수 세 개로 바꾼다.
  - `tests/infrastructure/setup.test.ts`가 기대하는 문자열 `GEMINI_API_KEY`를 `LLM_API_KEY`로 바꾼다. 이 테스트는 `.env.example`이 없어서 원래 실패한다.

## 4-2. 의존성 교체

- **수정**: `npm install openai@^6.49.0`, `npm uninstall @google/generative-ai`
- **확인**: `package.json`과 `package-lock.json`만 바뀌었는지 본다. 이 커밋만으로는 `llm-client.ts`의 import가 깨지므로 4-3과 같은 커밋으로 묶어도 된다.

## 4-3. `llm-client.ts`를 OpenAI 호환으로 다시 작성

### 요청

```ts
const client = new OpenAI({
  baseURL: getLlmBaseUrl(),
  apiKey: getLlmApiKey(),
  timeout: LLM_REQUEST_TIMEOUT_MS,
  maxRetries: 2,
});

await client.chat.completions.create({
  model: getLlmModel(),
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.1,
  max_tokens: 16384,
  response_format: { type: 'json_object' },
});
```

- 프롬프트는 지금처럼 문자열 하나를 user 메시지로 보낸다. system/user 분리는 응답이 달라질 수 있어서 이번 단계에서 하지 않는다.
- `json_object` 모드는 프롬프트에 "json"이라는 단어가 있어야 한다. 두 프롬프트 모두 "Respond ONLY with valid JSON"을 포함하므로 그대로 둔다.
- `max_tokens: 16384`가 실제 모델의 최대 출력 토큰을 넘으면 400 오류가 난다. 4-5에서 확인하고 필요하면 줄인다.

### 타임아웃

- `lib/constants.ts`에 `LLM_REQUEST_TIMEOUT_MS = 120000`(2분)을 추가하고 SDK `timeout`으로 넘긴다.
- 직접 만든 `withTimeout`은 지운다.
- 2분이 적당한지는 4-5에서 실제 응답 시간을 재서 정한다.

### 재시도

지금은 앱의 재시도 루프 하나가 모든 오류를 즉시 다시 시도한다. 이를 두 겹으로 나눈다.

| 오류 | 누가 재시도하나 | 횟수 | 대기 |
|---|---|---|---|
| 429, 5xx, 연결 오류, 타임아웃 | SDK (`maxRetries: 2`) | 2 | SDK의 지수 백오프 |
| 400, 401, 403, 404 등 | 재시도하지 않음 | 0 | — |
| 빈 응답, JSON 파싱 실패, Zod 검증 실패 | 앱 루프 (`MAX_RETRIES = 2`) | 2 | 1초, 2초 |

- 앱 루프는 SDK 오류(`OpenAI.APIError`)를 다시 시도하지 않는다. 둘 다 재시도하면 호출이 최대 9번까지 나간다.
- 응답 대기는 0단계에서 4단계로 미룬 "LLM 재시도 사이 대기 시간 없음"을 해결한다.
- `choices[0].message.content`가 비었거나 `null`이면 JSON 파싱 실패와 같이 처리한다. DeepSeek은 JSON 모드에서 빈 응답을 돌려줄 때가 있다.

### 오류 타입

- [lib/errors.ts](../../lib/errors.ts)의 `GeminiAPIError`를 `LLMAPIError`로 이름을 바꾼다(`name`도 `'LLMAPIError'`). 생성자 인자는 같다.
- SDK 오류는 `LLMAPIError`로 감싼다. `statusCode`는 `APIError.status`를, 타임아웃(`APIConnectionTimeoutError`)은 408을, 그 밖의 연결 오류는 503을 쓴다.
- 메시지의 "Gemini"는 "LLM"으로 바꾼다. 이 클래스는 `llm-client.ts`에서만 쓴다.

### 테스트

`tests/services/llm-client.test.ts`를 `openai` 모듈 mock으로 다시 쓴다.

- 성공: Zod 검증을 통과한 데이터를 돌려주고 요청에 `model`, `temperature`, `max_tokens`, `response_format`이 들어간다. 클라이언트는 `baseURL`, `apiKey`, `timeout`, `maxRetries`로 만든다.
- 파싱 실패 후 성공: 호출 2번, 결과 정상
- 빈 응답 후 성공: 호출 2번
- 스키마 불일치 3번: 호출 3번, `LLMAPIError('Schema validation failed')`
- SDK 오류(예: 401, 타임아웃): 호출 1번, 앱에서 다시 시도하지 않음. 상태 코드가 `statusCode`로 넘어온다.
- 재시도 대기: fake timers로 1초, 2초를 기다린 뒤에 다음 호출이 나가는지 확인

## 4-4. 문서 갱신

`docs/CLAUDE.md`에 따라 고친 부분은 `/humanize-korean`으로 윤문한다.

- [ARCHITECTURE.md](../ARCHITECTURE.md)
  - 1절 AI: Gemini 대신 OpenAI 호환 endpoint(DeepSeek), `json_object`, temperature 0.1, Zod 검증
  - 7절 Structured Output: 재시도 규칙을 위 표에 맞춘다
  - 9절 Retry Policy: "Gemini API"를 "LLM API"로 바꾸고 위 표에 맞춘다
- [DEVELOPMENT.md](../DEVELOPMENT.md): 1절 환경 변수, 2절 "UI layer에서 Gemini 직접 호출 금지"를 "LLM"으로
- [PRD.md](../PRD.md): 1절 "Gemini API 기반 LLM", 8절 "Gemini API failure"
- [ROADMAP.md](../ROADMAP.md): 2절에서 이 항목을 지운다

## 4-5. 실제 endpoint로 확인

API 키가 필요하므로 사용자와 함께 한다.

- 로컬 `.env`에 `LLM_*`를 넣고 profile 하나를 끝까지 분석한다.
- 확인할 것:
  - 두 프롬프트의 응답이 Zod 검증을 통과하는가
  - `max_tokens: 16384`가 모델 제한 안에 있는가
  - 호출 1회에 걸리는 시간 (2분 타임아웃이 적당한지)
  - 리포트·PDF·위젯이 이전과 같이 나오는가

---

## 배포 순서

배포 워크플로는 `main`에 push할 때마다 실행된다. 서버 설정을 먼저 바꾸지 않으면 머지 직후 분석이 전부 실패한다.

1. 배포 서버의 `.env`에 `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`을 추가한다(사용자).
2. 브랜치를 `main`에 머지한다(사용자).
3. 배포 후 분석 하나를 돌려 확인한다.
4. 서버 `.env`에서 `GEMINI_API_KEY`를 지운다.

## 4단계에서 하지 않는 것

| 항목 | 이유 |
|---|---|
| 프롬프트를 system/user 메시지로 분리 | 응답이 달라질 수 있다. 전환 결과를 먼저 확인한 뒤 따로 한다 |
| `json_schema` strict | `json_object` + Zod로 정했다 |
| 타임아웃 이후 작업 실제 취소 | 5단계 |
| 토큰 사용량·비용 기록 | 요구사항에 없다 |
| Node 22 이상으로 업그레이드 | `openai` 6.x로 피한다. Node 20은 지원 종료라 따로 다룬다 |
