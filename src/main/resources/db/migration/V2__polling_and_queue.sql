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
