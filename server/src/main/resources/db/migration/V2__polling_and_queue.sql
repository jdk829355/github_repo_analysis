-- 저장소별 진행 상태. 기존 행은 모두 분석이 끝난 행이므로 기본값은 COMPLETED.
ALTER TABLE repositories
  ADD COLUMN status text NOT NULL DEFAULT 'COMPLETED',  -- PENDING|ANALYZING|COMPLETED|SKIPPED|FAILED
  ADD COLUMN position int NOT NULL DEFAULT 0,
  ADD COLUMN error_message text;

-- 같은 프로필에 진행 중인 작업이 여럿이면 아래 unique index를 만들 수 없다.
-- 가장 최근 것만 남기고 나머지는 FAILED로 끝낸다. 남긴 작업은 PROCESSING이면 재시작 복구가, PENDING이면 큐가 맡는다.
UPDATE analysis_jobs
SET status = 'FAILED', error_message = '서버 재시작으로 분석이 중단되었습니다', updated_at = now() AT TIME ZONE 'UTC'
WHERE id IN (
  SELECT id FROM (
    SELECT id, row_number() OVER (PARTITION BY github_profile ORDER BY created_at DESC, id DESC) AS rn
    FROM analysis_jobs
    WHERE status IN ('PENDING', 'PROCESSING')
  ) ranked
  WHERE rn > 1
);

-- 같은 프로필의 진행 중인 작업은 하나만 존재한다. Redis 락을 대신한다.
CREATE UNIQUE INDEX analysis_jobs_active_profile_key
  ON analysis_jobs (github_profile)
  WHERE status IN ('PENDING', 'PROCESSING');

-- 큐가 PENDING 작업을 오래된 순서로 찾는다.
CREATE INDEX analysis_jobs_pending_idx
  ON analysis_jobs (created_at)
  WHERE status = 'PENDING';
