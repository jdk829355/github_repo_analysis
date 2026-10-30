# Development

## 1. Environment Variables

프로젝트 루트 `.env` 파일에 정의한다. 로컬에서 실행하면 Spring이 이 파일을 읽고 운영에서는 compose가 같은 이름의 환경 변수로 넘긴다. 형식은 [`.env.example`](../.env.example)을 따른다.

```env
GITHUB_TOKEN=
LLM_BASE_URL=
LLM_API_KEY=
LLM_MODEL=

SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:54329/pinnedsignal?currentSchema=pinnedsignal
SPRING_DATASOURCE_USERNAME=
SPRING_DATASOURCE_PASSWORD=

# 선택. 기본값 info
LOG_LEVEL=info
```

`GITHUB_TOKEN`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`은 필수이고 기본값이 없다. 하나라도 비어 있으면 앱이 부팅하지 못한다.

`.env`에 운영 DB 계정을 넣고 로컬에서 실행하면 Flyway 마이그레이션이 운영 DB에 바로 적용된다. 로컬에서는 로컬 Postgres를 가리킨다.

---

## 2. Coding Rules

### Java Rules

* Lombok을 쓴다. 생성자 주입은 `@RequiredArgsConstructor`, getter는 `@Getter`, 로거는 `@Slf4j`로 만든다
* 엔티티에는 `@Data`와 `@Setter`를 쓰지 않는다

---

### Architecture Rules

* Controller → Service → Repository 3계층으로 나눈다. Controller는 요청·응답과 화면 조각 선택만 맡고 Repository를 직접 부르지 않는다
* 비즈니스 규칙과 트랜잭션은 Service에 둔다
* 도메인(`analysis`, `report`) 사이의 호출은 Service끼리만 한다
* DB 접근은 Spring Data JPA로 한다. JPA로 표현하기 어려운 쿼리는 Repository의 `@Query(nativeQuery = true)`로 둔다
* UI layer에서 LLM 직접 호출 금지
* pure function 우선
* utility 함수 테스트 가능 구조 유지

---

### API Rules

* 모든 external API timeout 설정
* retry 정책 적용
* 사용자에게 보이는 오류는 `GlobalExceptionHandler`와 `toUserMessage`의 정해진 문구로 바꾼다

---

## 3. Testing Requirements

### TDD Requirements

개발 전 테스트 코드 작성 필수.

`./gradlew test`로 실행한다. Testcontainers가 Docker로 Postgres를 띄우므로 Docker가 떠 있어야 한다.

---

### Unit Test Scope

반드시 테스트할 영역:

* github client
* commit filtering
* llm client / parser
* LLM 응답 검증
* 분석 파이프라인, repository analysis, aggregation service
* DB 큐 (작업 집기, 재시작 복구, 타임아웃)
* 진행 조각, 리포트, 위젯 엔드포인트

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
* widget export
* invalid url handling
* timeout / failure handling

---

## 4. Docker Requirements

### Required Containers

* app

PostgreSQL은 `SPRING_DATASOURCE_URL`로 연결하는 외부 인스턴스(Supabase)를 쓴다.

compose는 저장소 루트에서 `--project-directory .`를 붙여 실행한다. 그래야 프로젝트 이름이 `github_repo_analysis`로 유지되고 루트의 `.env`를 읽는다. 로컬에서 이미지 없이 띄울 때는 `./gradlew bootRun`을 쓴다.

---

### Required Commands

반드시 다음 흐름 검증 수행:

```bash
docker build -t pinnedsignal .
docker compose --project-directory . -f deploy/docker-compose.yml up
curl localhost:3000/api/health
```

---

## 5. Directory Structure

```text
/src/main/java/pinnedsignal
  /global       공통 설정, GitHub·LLM 클라이언트, 로그, health
  /analysis     분석 요청, 큐, 파이프라인, 진행 화면
  /report       리포트, 위젯
/src/main/resources
  /db/migration Flyway
  /prompts      LLM 프롬프트
  /templates    Thymeleaf
  /static       js, css
/src/main/tailwind
/src/test
/deploy
```

자세한 구조는 [마이그레이션 계획의 디렉터리 구조](refactor/spring-htmx-migration-plan.md#디렉터리-구조)를 따른다.
