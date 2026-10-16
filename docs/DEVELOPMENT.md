# Development

## 1. Environment Variables

프로젝트 루트 `.env` 파일에 정의한다.

```env
GITHUB_TOKEN=
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=

DATABASE_URL=
REDIS_URL=

NEXT_PUBLIC_APP_URL=
```

`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` 세 개는 모두 필수이고 기본값이 없다. 값이 없으면 LLM을 호출하는 시점에 오류가 난다.

Docker 이미지에서는 이 외에 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`(시스템 Chromium 경로)와 `PDF_EXPORT_DIR`(PDF 저장 경로)을 설정한다.

---

## 2. Coding Rules

### TypeScript Rules

* strict mode 활성화
* avoid any
* explicit typing 사용

---

### Architecture Rules

* service layer 분리
* UI layer에서 LLM 직접 호출 금지
* pure function 우선
* utility 함수 테스트 가능 구조 유지
* Queue와 Worker 모듈 분리: Worker는 worker 진입점에서만 만든다

---

### API Rules

* 모든 external API timeout 설정
* retry 정책 적용
* error boundary 적용

---

## 3. Testing Requirements

### TDD Requirements

개발 전 테스트 코드 작성 필수.

---

### Unit Test Scope

반드시 테스트할 영역:

* github client
* commit filtering
* llm client / parser
* zod validation
* orchestrator, repository analysis, aggregation service
* queue / worker 모듈 분리
* report / PDF / widget API

---

### UI/E2E Test Scope

현재 자동화된 브라우저 E2E 테스트는 없다. 다음 시나리오는 수동으로 확인한다.

#### Required Scenarios

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

## 4. Docker Requirements

### Required Containers

* next-app
* worker
* redis

PostgreSQL은 `DATABASE_URL`로 연결하는 외부 인스턴스를 쓴다. docker-compose의 postgres 서비스는 주석 처리되어 있다.

---

### Required Commands

반드시 다음 흐름 검증 수행:

```bash
docker build
docker compose up
application access verification
```

---

## 5. Directory Structure

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
