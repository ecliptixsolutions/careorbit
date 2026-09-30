-- CareOrbit — Add password_reset_tokens table
-- Run once against u791891216_careorbit before deploying the updated API.
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          CHAR(36)     NOT NULL,
  user_id     CHAR(36)     NOT NULL,
  token       CHAR(64)     NOT NULL,
  expires_at  DATETIME(6)  NOT NULL,
  used_at     DATETIME(6)  NULL,
  created_at  DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY  uk_prt_token  (token),
  KEY         idx_prt_user  (user_id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
