-- ShedLock (platform.jobs, docs/ARCHITECTURE.md): one row per scheduled job holds the lock, so a job never runs
-- twice at once when two backend instances are up. Additive only: rollback = older images (they ignore the table).

CREATE TABLE shedlock (
    name       VARCHAR(64)  NOT NULL,
    lock_until TIMESTAMP(3) NOT NULL,
    locked_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    locked_by  VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);
