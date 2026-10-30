# PRD

관련 문서:

* [ARCHITECTURE.md](ARCHITECTURE.md)
* [DEVELOPMENT.md](DEVELOPMENT.md)
* [ROADMAP.md](ROADMAP.md)

---

## 1. Product Overview

GitHub Profile Analyzer(서비스 이름 Pinned Signal)는 사용자가 입력한 GitHub Profile URL에서 pin된 repository와 commit history를 분석해 어떤 프로젝트를 수행했고 어떤 역할을 맡았는지 자동으로 추론하는 서비스이다.

서비스는 GitHub API로 데이터를 수집하고 OpenAI 호환 API 기반 LLM으로 repository 수준과 profile 수준의 엔지니어링 보고서를 만든다.

결과는 웹 UI, PDF, README에 넣을 수 있는 SVG 위젯으로 제공한다.

---

## 2. Goals

### Primary Goals

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

## 3. Non-Goals

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

## 4. User Flow

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

## 5. Functional Requirements

### 5.1 GitHub Profile Input

사용자는 GitHub profile URL을 입력할 수 있어야 한다.

예시:

```text
https://github.com/username
```

`github.com/username`이나 `username`만 입력해도 위 형식으로 정규화한다. 올바른 GitHub username 형식이 아니면 요청을 거부한다.

---

### 5.2 Repository Collection

시스템은 GitHub API로 다음 데이터를 수집한다.

분석 대상은 profile에 **pin된 repository**(GraphQL `pinnedItems`, 최대 6개)이다.

#### Repository Metadata

* repository name
* description
* primary language
* stars
* forks
* updated date

#### Repository Content

* README (최대 10KB까지 사용)
* commit logs

---

### 5.3 Repository Filtering Rules

pin된 repository 중 다음은 제외한다.

* fork repository
* archived repository
* empty repository

제외하고 나서 남은 repository가 없으면 job은 `FAILED`로 끝난다.

---

### 5.4 Commit Collection Rules

기본 정책:

* repository 당 최대 300개 commit 수집
* 해당 username이 작성한 commit만 분석 (GitHub API `author` 조건)
* merge commit 제외
* auto-generated commit 제외 (5.5의 규칙으로 거른다)

거르고 남은 commit이 없는 repository는 `SKIPPED`로 처리하고 분석에서 뺀다.

---

### 5.5 Commit Filtering Rules

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

### 5.6 Star 검증

분석을 요청한 계정이 이 프로젝트의 repository(`jdk829355/github_repo_analysis`)에 star를 눌렀는지 확인한다.

* 별도 인증 절차는 아니다. 입력한 username의 star 목록(`GET /users/{username}/starred`)에 해당 repository가 있는지만 본다.
* 검증을 통과하지 못하면 분석 job을 만들지 않고 403으로 응답한다.
* star 검증은 `POST /api/analyze`가 job을 만들기 직전에 한 번만 수행한다. 화면의 '분석하기' 버튼은 곧바로 이 요청을 보내고 403(star 없음)이 돌아올 때만 '분석 전 계정 소유 여부를 확인합니다' 안내와 '검증 후 분석' 버튼을 띄운다. 그 버튼도 같은 요청을 다시 보낸다.

---

### 5.7 이전 분석 재사용

같은 profile을 이전에 분석해 `COMPLETED`된 job이 있으면 다음처럼 재사용한다.

* pin된 repository의 `updated_at`이 이전과 같으면 그 repository의 분석 결과를 다시 쓴다.
* 더는 pin되지 않은 repository의 이전 결과는 삭제한다.
* pin된 repository 구성과 각 `updated_at`이 모두 같고 이전 리포트에 Green/Red Flags가 있으면 profile 종합 결과와 위젯도 다시 쓴다.

---

## 6. Report Structure

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

## 7. Role Estimation Rules

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

## 8. Error Handling Rules

다음 에러를 처리해야 한다.

* invalid GitHub URL
* star 검증 실패
* GitHub rate limit
* repository fetch failure
* README missing (README 없이 분석을 계속한다)
* empty repository
* pin된 repository 없음
* LLM API failure
* malformed LLM output
* timeout

한 repository의 분석이 실패해도 job 전체는 실패하지 않는다. 그 repository만 빠진다. 분석에 성공한 repository가 하나도 없으면 profile 종합 단계에서 job이 `FAILED`가 된다.

---

## 9. Export Requirements

### 9.1 PDF

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

### 9.2 SVG Widget

분석이 끝난 profile의 요약 카드를 SVG 이미지로 제공한다. GitHub README에 붙여 넣는 용도이다.

* `GET /api/widget/[jobId]?theme=light|dark`로 제공한다. theme을 생략하면 light이다.
* 위젯에는 사용자명, 요약, 역할, Green/Red Flags, 주요 언어가 들어간다.
* 리포트를 만들 때 라이트·다크 SVG를 함께 만들어 저장한다. 저장된 SVG가 현재 위젯 버전이 아니면 다시 만든다.
* 리포트 화면의 "SVG 위젯 내보내기"에서 미리보기와 Markdown 코드 복사를 제공한다.

---

## 10. Definition of Done

다음 조건을 만족해야 완료로 간주한다.

* GitHub URL 입력 가능
* Star 검증 동작
* Pinned repository 분석 가능
* Structured output validation 통과
* Report 생성 가능
* PDF export 가능
* SVG 위젯 제공 가능
* Gradle tests passing
* Docker build success
* Docker runtime success
