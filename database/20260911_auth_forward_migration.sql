-- Safe forward migration only. Review and run once against u791891216_careorbit.
-- Does not alter or recreate the existing CareOrbit schema.
-- profiles.id remains the user identity; auth_users.id shares the same UUID (1:1).
CREATE TABLE IF NOT EXISTS auth_users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  email_lower VARCHAR(255) GENERATED ALWAYS AS (LOWER(email)) STORED,
  password_hash VARCHAR(255) NOT NULL,
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  last_sign_in_at DATETIME(6) NULL,
  UNIQUE KEY uk_auth_users_email (email),
  UNIQUE KEY uk_auth_users_email_lower (email_lower)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Idempotent upgrades for existing deployments that ran the earlier minimal version
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email_lower VARCHAR(255) GENERATED ALWAYS AS (LOWER(email)) STORED;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS email_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS last_sign_in_at DATETIME(6) NULL;
-- Ensure case-insensitive uniqueness even if earlier migration created only uk_auth_users_email
CREATE UNIQUE INDEX IF NOT EXISTS uk_auth_users_email_lower ON auth_users (email_lower);

DROP TRIGGER IF EXISTS trg_auth_users_updated_at;
DELIMITER $$
CREATE TRIGGER trg_auth_users_updated_at
BEFORE UPDATE ON auth_users
FOR EACH ROW
BEGIN
  SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;
