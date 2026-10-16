# Roadmap

## 1. Future Expansion

향후 확장 가능 영역:

* private repository support
* pin되지 않은 repository 분석
* OAuth login
* multi-user workspace
* vector search
* report history
* team analysis
* resume generation
* hiring evaluation mode
* recruiter dashboard

---

## 2. 향후 변경 예정

리팩터링 계획에 따라 다음이 바뀔 예정이다. 다른 문서는 현재 구현을 기준으로 쓰므로, 바뀌면 해당 절을 고친다.

* LLM 호출을 Gemini SDK에서 OpenAI 호환 endpoint로 전환 ([ARCHITECTURE 1](ARCHITECTURE.md#1-technical-stack), [7](ARCHITECTURE.md#7-structured-output-rules), [9](ARCHITECTURE.md#9-retry-policy))
* SSE를 없애고 상태 조회 API와 polling으로 전환 ([ARCHITECTURE 3](ARCHITECTURE.md#3-background-job-architecture)). Redis와 BullMQ는 큐 용도로 유지한다.
* 실패한 분석의 수동 재시도 옵션 제공
* 요구사항과 도메인 규칙 정리, 이에 따른 DB 테이블·필드 추가
