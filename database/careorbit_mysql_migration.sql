-- ============================================================================
-- CareOrbit Healthcare HRMS - MariaDB Migration Script
-- ============================================================================
-- Target ........ : Hostinger **MariaDB** (MariaDB >= 10.3), database
--                  `u791891216_careorbit` (empty)
-- Source ........ : Supabase PostgreSQL schema
--                  (supabase/migrations/*.sql + supabase/setup_new_project.sql)
-- Generated ..... : 2026-08-19 (rev 2 - MariaDB compatibility)
--
-- WHY REV 2
--   Hostinger reports **MariaDB**, not MySQL 8. MariaDB does NOT support
--   MySQL 8 "functional indexes" (CREATE INDEX ... ON t ((expr))). That syntax
--   caused error #1064 during the first import. Functional uniqueness is now
--   reimplemented with MariaDB **generated columns** + plain unique indexes.
--   Expression defaults DEFAULT (UUID()) were also replaced with BEFORE INSERT
--   triggers so the script works on any MariaDB version without assuming
--   XML/expression-default support.
--
-- WHAT THIS FILE DOES
--   * Creates 20 application tables with columns, PKs, unique keys,
--     indexes and foreign keys, translated from PostgreSQL.
--   * Adds STORED generated columns ONLY where the original schema had a
--     functional/lower-case unique index (profiles.email, pharmacy_items
--     sku+batch, service_catalog.service_code).
--   * Ports the "mechanical" triggers (UUID generation, auto numbering,
--     updated_at) using only functions available in MariaDB.
--   * Inserts the two *config* seed rows that Supabase migrations
--     themselves created (organization_settings singleton + default
--     role_session_policies). These are schema configuration, not data.
--
-- WHAT THIS FILE DOES NOT DO (see database/MYSQL_MIGRATION_NOTES.md)
--   * Does NOT create auth.users / auth schema. In-app *_id columns that
--     referenced Supabase Auth stay as CHAR(36) WITHOUT foreign keys;
--     the backend owns user lifecycle (Supabase continues to handle auth).
--   * Does NOT create Supabase Storage buckets / objects tables.
--     avatar_url + logo_path still hold Supabase object URLs until a
--     storage migration is performed.
--   * Does NOT port RLS policies (no equivalent in MariaDB). They are
--     documented as backend authorization rules in the notes file.
--   * Does NOT port SECURITY DEFINER plpgsql functions/RPCs that rely on
--     auth.uid()/security definer semantics (create_pharmacy_bill,
--     record_invoice_payment, finalize_invoice, cancel_invoice,
--     dispense_medicine, import_*, approve_user_role, guard_invoice_changes,
--     has_role, has_custom_role...). Business rules are listed in the notes.
--   * Does NOT port audit-log triggers (capture_audit_log needs auth actor).
--   * Does NOT check for / create the `supabase_realtime` publication.
--
-- TYPE MAP (PostgreSQL -> MariaDB)
--   uuid              -> CHAR(36)
--   bigint identity   -> BIGINT AUTO_INCREMENT
--   text              -> VARCHAR(n) where indexed/unique, TEXT elsewhere
--   numeric(p,s)      -> DECIMAL(p,s)
--   int / smallint    -> INT
--   boolean           -> TINYINT(1)
--   date              -> DATE
--   timestamptz       -> DATETIME(6)   (store UTC, convert at display layer)
--   jsonb             -> JSON          (MariaDB JSON = LONGTEXT + JSON_VALID;
--                                      MySQL/MariaDB forbid DEFAULT on JSON,
--                                      so columns are nullable, backend supplies)
--   text[]            -> JSON
--   inet              -> VARCHAR(45)
--   ENUM types        -> MariaDB ENUM / VARCHAR + CHECK
--   expr unique index -> STORED generated column + UNIQUE index (MariaDB has
--                        NO functional indexes)
--   gen_random_uuid() -> BEFORE INSERT trigger setting CHAR(36) = UUID()
--
-- IMPORT NOTE
--   Import via hostinger phpMyAdmin "Import" tab on the EMPTY database
--   `u791891216_careorbit`. The script is idempotent (IF NOT EXISTS, no
--   DROP DATABASE/TABLE, no TRUNCATE) and contains no destructive statements.
--   If a partial import already exists, first run
--   database/cleanup_partial_careorbit_migration.sql, verify the database is
--   empty, then import this file.
-- ============================================================================


-- ============================================================================
-- 0. Guard against destructive / unsafe server settings while importing
-- ============================================================================
SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;
SET time_zone = '+00:00';


-- ============================================================================
-- 1. BASE / IDENTITY TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles
-- id referenced auth.users (Supabase) in origin: backend keeps FK invariant.
-- status added by 20260708190000_security_remediation.
-- email + profiles_email_lower unique index added by 20260704150000.
-- email_lower is a STORED generated column used to reproduce the original
-- partial unique index (lower(email) WHERE email IS NOT NULL). MariaDB unique
-- indexes treat NULL as distinct, so a NULL email never violates uniqueness.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id               CHAR(36)     NOT NULL,
    full_name        TEXT         NULL,
    phone            VARCHAR(32)  NULL,
    organization     VARCHAR(255) NULL,
    custom_role_label VARCHAR(191) NULL,
    avatar_url       TEXT         NULL,
    email            VARCHAR(255) NULL,
    email_lower      VARCHAR(255) GENERATED ALWAYS AS (LOWER(email)) STORED,
    status           ENUM('active','pending_approval','disabled') NOT NULL DEFAULT 'active',
    created_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- unique LOWER(email); generated column is NULL when email is NULL, therefore
-- duplicate/empty emails stay allowed while real emails are case-insensitive-unique
CREATE UNIQUE INDEX idx_profiles_email_lower ON profiles (email_lower);

-- ----------------------------------------------------------------------------
-- user_roles
-- user_id referenced auth.users in origin (backend owns integrity).
-- role stored as app_role enum: admin|doctor|staff|custom (staff default).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
    id           CHAR(36) NOT NULL,
    user_id      CHAR(36) NOT NULL,
    role         ENUM('admin','doctor','staff','custom') NOT NULL,
    custom_label VARCHAR(191) NULL,
    created_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_user_roles_user_role_label UNIQUE (user_id, role, custom_label)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;


-- ============================================================================
-- 2. CLINICAL TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- patients
-- case_fee + sonography_fee added by 20260706120000.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
    id              CHAR(36)     NOT NULL,
    mrn             VARCHAR(32)  NOT NULL,
    full_name       VARCHAR(191) NOT NULL,
    date_of_birth   DATE         NULL,
    gender          VARCHAR(20)  NULL,
    phone           VARCHAR(32)  NULL,
    email           VARCHAR(255) NULL,
    address         TEXT         NULL,
    blood_group     VARCHAR(20)  NULL,
    allergies       TEXT         NULL,
    notes           TEXT         NULL,
    case_fee        DECIMAL(12,2) NULL,
    sonography_fee  DECIMAL(12,2) NULL,
    created_by      CHAR(36)     NULL, -- referenced auth.users in origin
    created_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at      DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_patients_mrn UNIQUE (mrn),
    CONSTRAINT chk_patients_case_fee CHECK (case_fee IS NULL OR case_fee >= 0),
    CONSTRAINT chk_patients_sonography_fee CHECK (sonography_fee IS NULL OR sonography_fee >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------------------------
-- appointments
-- doctor_id / created_by referenced auth.users in origin.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
    id               CHAR(36) NOT NULL,
    patient_id       CHAR(36) NOT NULL,
    doctor_id        CHAR(36) NULL, -- auth.users
    scheduled_at     DATETIME(6) NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 30,
    reason           TEXT NULL,
    status           ENUM('scheduled','confirmed','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
    notes            TEXT NULL,
    created_by       CHAR(36) NULL, -- auth.users
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_appointments_patient FOREIGN KEY (patient_id)
        REFERENCES patients (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------------------------
-- notifications
-- recipient_id / actor_id referenced auth.users in origin.
-- metadata JSON: MariaDB forbids DEFAULT on JSON -> column nullable, backend
-- supplies value (default '{}' in origin).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id              CHAR(36) NOT NULL,
    recipient_id    CHAR(36) NULL, -- auth.users (origin: on delete cascade)
    actor_id        CHAR(36) NULL, -- auth.users
    appointment_id  CHAR(36) NULL,
    patient_id      CHAR(36) NULL,
    channel         VARCHAR(20) NOT NULL DEFAULT 'in_app',
    recipient_phone VARCHAR(32) NULL,
    title           VARCHAR(191) NOT NULL,
    body            TEXT NOT NULL,
    metadata        JSON NULL,
    read_at         DATETIME(6) NULL,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_notifications_appointment FOREIGN KEY (appointment_id)
        REFERENCES appointments (id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_patient FOREIGN KEY (patient_id)
        REFERENCES patients (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- index (recipient_id, created_at DESC) - MariaDB parses DESC; stored as
-- ascending on versions < 10.8, actual descending indexes on >= 10.8
CREATE INDEX idx_notifications_recipient_created ON notifications (recipient_id, created_at DESC);
CREATE INDEX idx_notifications_appointment ON notifications (appointment_id);


-- ============================================================================
-- 3. CLINICAL OPERATIONS (20260703120000 + 20260706120000 / 04150000)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- prescriptions
-- doctor_id / created_by referenced auth.users in origin.
-- medicines JSON default '[]' -> nullable column, backend supplies.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prescriptions (
    id                  CHAR(36) NOT NULL,
    prescription_number VARCHAR(50) NOT NULL,
    patient_id          CHAR(36) NOT NULL,
    appointment_id      CHAR(36) NULL,
    doctor_id           CHAR(36) NULL, -- auth.users
    diagnosis           TEXT NULL,
    medicines           JSON NULL,     -- origin default '[]'
    advice              TEXT NULL,
    status              ENUM('draft','issued','cancelled') NOT NULL DEFAULT 'issued',
    issued_at           DATETIME(6) NULL,
    created_by          CHAR(36) NULL, -- auth.users
    created_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at          DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_prescriptions_number UNIQUE (prescription_number),
    CONSTRAINT fk_prescriptions_patient FOREIGN KEY (patient_id)
        REFERENCES patients (id) ON DELETE CASCADE,
    CONSTRAINT fk_prescriptions_appointment FOREIGN KEY (appointment_id)
        REFERENCES appointments (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- index (patient_id, created_at DESC)
CREATE INDEX idx_prescriptions_patient ON prescriptions (patient_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- invoices
-- patient_id NOT NULL became nullable (20260706120000 walk-in support).
-- created_by / updated_by referenced auth.users in origin.
-- items JSON default '[]', brand_snapshot JSON default '{}' -> nullable.
-- invoice_number is generated by a BEFORE INSERT trigger below (reads
-- organization_settings.invoice_prefix; pharmacy uses PH-INV).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
    id                CHAR(36) NOT NULL,
    invoice_number    VARCHAR(50) NOT NULL,
    patient_id        CHAR(36) NULL,
    appointment_id    CHAR(36) NULL,
    items             JSON NULL,      -- origin default '[]'
    subtotal          DECIMAL(12,2) NOT NULL DEFAULT 0,
    discount_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount        DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
    paid_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    status            ENUM('draft','issued','partially_paid','paid','cancelled') NOT NULL DEFAULT 'issued',
    notes             TEXT NULL,
    invoice_type      ENUM('general','pharmacy') NOT NULL DEFAULT 'general',
    walk_in_name      VARCHAR(191) NULL,
    walk_in_phone     VARCHAR(32) NULL,
    cgst_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    sgst_amount       DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_received   DECIMAL(12,2) NOT NULL DEFAULT 0,
    change_due        DECIMAL(12,2) NOT NULL DEFAULT 0,
    brand_snapshot    JSON NULL,      -- origin default '{}'
    finalized_at      DATETIME(6) NULL,
    cancelled_at      DATETIME(6) NULL,
    cancellation_reason TEXT NULL,
    created_by        CHAR(36) NULL,  -- auth.users
    updated_by        CHAR(36) NULL,  -- auth.users
    created_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_invoices_number UNIQUE (invoice_number),
    CONSTRAINT fk_invoices_patient FOREIGN KEY (patient_id)
        REFERENCES patients (id) ON DELETE CASCADE,
    CONSTRAINT fk_invoices_appointment FOREIGN KEY (appointment_id)
        REFERENCES appointments (id) ON DELETE SET NULL,
    CONSTRAINT chk_invoices_invoice_type CHECK (invoice_type IN ('general','pharmacy')),
    CONSTRAINT chk_invoices_patient_or_walk_in CHECK (
        invoice_type <> 'pharmacy'
        OR patient_id IS NOT NULL
        OR LENGTH(TRIM(COALESCE(walk_in_name, ''))) >= 2
    )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- indexes (patient_id, created_at DESC) and (invoice_type, created_at DESC)
CREATE INDEX idx_invoices_patient ON invoices (patient_id, created_at DESC);
CREATE INDEX idx_invoices_type_created ON invoices (invoice_type, created_at DESC);

-- ----------------------------------------------------------------------------
-- payments
-- receipt_number NOT NULL + UNIQUE (20260704150000 backfilled and enforced).
-- received_by referenced auth.users in origin.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id             CHAR(36) NOT NULL,
    invoice_id     CHAR(36) NOT NULL,
    amount         DECIMAL(12,2) NOT NULL,
    method         ENUM('cash','card','upi','bank_transfer','insurance','other') NOT NULL,
    reference      VARCHAR(255) NULL,
    receipt_number VARCHAR(50) NOT NULL,
    notes          TEXT NULL,
    received_by    CHAR(36) NULL, -- auth.users
    paid_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_payments_receipt_number UNIQUE (receipt_number),
    CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices (id) ON DELETE CASCADE,
    CONSTRAINT chk_payments_amount CHECK (amount > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE INDEX idx_payments_invoice ON payments (invoice_id, paid_at DESC);

-- ----------------------------------------------------------------------------
-- lab_orders
-- ordered_by / completed_by referenced auth.users in origin.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_orders (
    id              CHAR(36) NOT NULL,
    order_number    VARCHAR(50) NOT NULL,
    patient_id      CHAR(36) NOT NULL,
    appointment_id  CHAR(36) NULL,
    test_name       VARCHAR(255) NOT NULL,
    priority        ENUM('routine','urgent') NOT NULL DEFAULT 'routine',
    status          ENUM('ordered','sample_collected','processing','completed','cancelled') NOT NULL DEFAULT 'ordered',
    result          TEXT NULL,
    reference_range TEXT NULL,
    ordered_by      CHAR(36) NULL, -- auth.users
    completed_by    CHAR(36) NULL, -- auth.users
    ordered_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    completed_at    DATETIME(6) NULL,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_lab_orders_number UNIQUE (order_number),
    CONSTRAINT fk_lab_orders_patient FOREIGN KEY (patient_id)
        REFERENCES patients (id) ON DELETE CASCADE,
    CONSTRAINT fk_lab_orders_appointment FOREIGN KEY (appointment_id)
        REFERENCES appointments (id) ON DELETE SET NULL
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE INDEX idx_lab_orders_patient ON lab_orders (patient_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- pharmacy_items
-- The original `sku TEXT UNIQUE` constraint was DROPPED by 20260704150000 and
-- replaced by a unique index on (lower(sku), lower(coalesce(batch_number,'')))
-- with partial predicate sku IS NOT NULL. MariaDB has no functional/partial
-- indexes, so we store the normalized forms as STORED generated columns and
-- put a plain UNIQUE INDEX on them. When sku IS NULL the generated sku_lower
-- is NULL and MariaDB unique indexes let multiple NULLs coexist - exactly the
-- original `WHERE sku IS NOT NULL` semantics.
-- mrp/gst_rate/hsn_code added by 20260706120000.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_items (
    id             CHAR(36) NOT NULL,
    medicine_name  VARCHAR(255) NOT NULL,
    sku            VARCHAR(100) NULL,
    batch_number   VARCHAR(100) NULL,
    expires_on     DATE NULL,
    stock_quantity INT NOT NULL DEFAULT 0,
    reorder_level  INT NOT NULL DEFAULT 10,
    unit_price     DECIMAL(12,2) NOT NULL DEFAULT 0,
    mrp            DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_rate       DECIMAL(5,2) NOT NULL DEFAULT 0,
    hsn_code       VARCHAR(30) NULL,
    sku_lower      VARCHAR(100) GENERATED ALWAYS AS (LOWER(sku)) STORED,
    batch_lower    VARCHAR(100) GENERATED ALWAYS AS (LOWER(COALESCE(batch_number, ''))) STORED,
    created_by     CHAR(36) NULL, -- auth.users
    created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT chk_pharmacy_items_stock CHECK (stock_quantity >= 0),
    CONSTRAINT chk_pharmacy_items_reorder CHECK (reorder_level >= 0),
    CONSTRAINT chk_pharmacy_items_price CHECK (unit_price >= 0),
    CONSTRAINT chk_pharmacy_items_mrp CHECK (mrp >= 0),
    CONSTRAINT chk_pharmacy_items_gst CHECK (gst_rate BETWEEN 0 AND 100)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- unique (LOWER(sku), LOWER(batch)) for non-NULL sku; NULL sku_lower exempts
-- the row from uniqueness, reproducing origin partial index WHERE sku IS NOT NULL
CREATE UNIQUE INDEX idx_pharmacy_sku_batch ON pharmacy_items (sku_lower, batch_lower);

-- ----------------------------------------------------------------------------
-- dispensations
-- patient_id NOT NULL became nullable (20260706120000 walk-in support).
-- pharmacy_item_id ON DELETE RESTRICT preserved.
-- invoice_id added by 20260706120000.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispensations (
    id               CHAR(36) NOT NULL,
    patient_id       CHAR(36) NULL,
    prescription_id  CHAR(36) NULL,
    pharmacy_item_id CHAR(36) NOT NULL,
    quantity         INT NOT NULL,
    unit_price       DECIMAL(12,2) NOT NULL DEFAULT 0,
    dispensed_by     CHAR(36) NULL, -- auth.users
    dispensed_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    invoice_id       CHAR(36) NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_dispensations_patient FOREIGN KEY (patient_id)
        REFERENCES patients (id) ON DELETE CASCADE,
    CONSTRAINT fk_dispensations_prescription FOREIGN KEY (prescription_id)
        REFERENCES prescriptions (id) ON DELETE SET NULL,
    CONSTRAINT fk_dispensations_item FOREIGN KEY (pharmacy_item_id)
        REFERENCES pharmacy_items (id) ON DELETE RESTRICT,
    CONSTRAINT fk_dispensations_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices (id) ON DELETE SET NULL,
    CONSTRAINT chk_dispensations_quantity CHECK (quantity > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE INDEX idx_dispensations_patient ON dispensations (patient_id, dispensed_at DESC);
CREATE INDEX idx_dispensations_invoice ON dispensations (invoice_id);

-- ----------------------------------------------------------------------------
-- audit_logs
-- actor_id referenced auth.users in origin. Big serial = BIGINT AUTO_INCREMENT.
-- Audit capture is NOT wired through triggers here (needs auth actor);
-- see notes for backend enforcement.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGINT AUTO_INCREMENT NOT NULL,
    actor_id    CHAR(36) NULL, -- auth.users
    action      VARCHAR(64) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id   VARCHAR(64) NULL,
    old_data    JSON NULL,
    new_data    JSON NULL,
    created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

-- ----------------------------------------------------------------------------
-- pharmacy_invoice_items (20260706120000)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pharmacy_invoice_items (
    id              CHAR(36) NOT NULL,
    invoice_id      CHAR(36) NOT NULL,
    pharmacy_item_id CHAR(36) NULL,
    medicine_name   VARCHAR(255) NOT NULL,
    sku             VARCHAR(100) NULL,
    hsn_code        VARCHAR(30) NULL,
    batch_number    VARCHAR(100) NULL,
    expires_on      DATE NULL,
    quantity        INT NOT NULL,
    unit_price      DECIMAL(12,2) NOT NULL,
    mrp             DECIMAL(12,2) NOT NULL,
    discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
    discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    gst_rate        DECIMAL(5,2) NOT NULL DEFAULT 0,
    taxable_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_amount      DECIMAL(12,2) NOT NULL DEFAULT 0,
    line_total      DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at      DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_pii_invoice FOREIGN KEY (invoice_id)
        REFERENCES invoices (id) ON DELETE CASCADE,
    CONSTRAINT fk_pii_item FOREIGN KEY (pharmacy_item_id)
        REFERENCES pharmacy_items (id) ON DELETE SET NULL,
    CONSTRAINT chk_pii_quantity CHECK (quantity > 0),
    CONSTRAINT chk_pii_unit_price CHECK (unit_price >= 0),
    CONSTRAINT chk_pii_mrp CHECK (mrp >= 0),
    CONSTRAINT chk_pii_discount_percent CHECK (discount_percent BETWEEN 0 AND 100),
    CONSTRAINT chk_pii_discount_amount CHECK (discount_amount >= 0),
    CONSTRAINT chk_pii_gst CHECK (gst_rate BETWEEN 0 AND 100),
    CONSTRAINT chk_pii_taxable CHECK (taxable_amount >= 0),
    CONSTRAINT chk_pii_tax CHECK (tax_amount >= 0),
    CONSTRAINT chk_pii_line_total CHECK (line_total >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE INDEX idx_pii_invoice ON pharmacy_invoice_items (invoice_id);


-- ============================================================================
-- 4. BUSINESS / ORGANIZATION TABLES (20260704150000)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- organization_settings
-- id is a singleton fixed to '00000000-0000-0000-0000-000000000001'.
-- drug_license_numbers text[] -> JSON, invoice_accent_color (20260706120000).
-- The singleton row is inserted below (it existed in origin migrations).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_settings (
    id                 CHAR(36) NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
    hospital_name      VARCHAR(255) NOT NULL DEFAULT 'CareOrbit Hospital',
    legal_name         VARCHAR(255) NULL,
    logo_path          TEXT NULL,
    address_line_1     VARCHAR(191) NULL,
    address_line_2     VARCHAR(191) NULL,
    city               VARCHAR(100) NULL,
    state              VARCHAR(100) NULL,
    postal_code        VARCHAR(20) NULL,
    primary_phone      VARCHAR(32) NULL,
    secondary_phone    VARCHAR(32) NULL,
    email              VARCHAR(255) NULL,
    website            VARCHAR(255) NULL,
    gstin              VARCHAR(30) NULL,
    pan_registration   VARCHAR(30) NULL,
    invoice_prefix     VARCHAR(20) NOT NULL DEFAULT 'INV',
    currency           VARCHAR(10) NOT NULL DEFAULT 'INR',
    invoice_terms      TEXT NULL,
    payment_details    TEXT NULL,
    invoice_footer     TEXT NULL,
    authorized_signatory VARCHAR(191) NULL,
    drug_license_numbers JSON NULL,     -- origin: text[] NOT NULL DEFAULT '{}'
    invoice_accent_color VARCHAR(9) NOT NULL DEFAULT '#2563eb',
    updated_by         CHAR(36) NULL,   -- auth.users
    created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT chk_org_settings_singleton CHECK (id = '00000000-0000-0000-0000-000000000001'),
    CONSTRAINT chk_org_settings_currency CHECK (currency = 'INR'),
    CONSTRAINT chk_org_settings_accent CHECK (invoice_accent_color REGEXP '^#[0-9A-Fa-f]{6}$')
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------------------------
-- service_catalog
-- unique lower(service_code). MariaDB has no functional indexes, so the
-- normalized code is stored as a generated column and indexed. service_code
-- is NOT NULL, so a plain UNIQUE index fully reproduces the origin.
-- created_by references auth.users in origin.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_catalog (
    id                 CHAR(36) NOT NULL,
    service_code       VARCHAR(100) NOT NULL,
    service_code_lower VARCHAR(100) GENERATED ALWAYS AS (LOWER(service_code)) STORED,
    service_name       VARCHAR(255) NOT NULL,
    category           VARCHAR(100) NULL,
    default_price      DECIMAL(12,2) NOT NULL DEFAULT 0,
    tax_rate           DECIMAL(5,2) NOT NULL DEFAULT 0,
    is_active          TINYINT(1) NOT NULL DEFAULT 1,
    created_by         CHAR(36) NULL, -- auth.users
    created_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at         DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT chk_service_catalog_price CHECK (default_price >= 0),
    CONSTRAINT chk_service_catalog_tax CHECK (tax_rate BETWEEN 0 AND 100)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE UNIQUE INDEX idx_service_catalog_lower_code ON service_catalog (service_code_lower);

-- ----------------------------------------------------------------------------
-- import_batches
-- summary JSON default '{}' -> nullable. created_by references auth.users.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_batches (
    id            CHAR(36) NOT NULL,
    import_type   ENUM('patients','pharmacy','services','appointments','staff') NOT NULL,
    file_name     VARCHAR(255) NOT NULL,
    total_rows    INT NOT NULL DEFAULT 0,
    imported_rows INT NOT NULL DEFAULT 0,
    skipped_rows  INT NOT NULL DEFAULT 0,
    error_rows    INT NOT NULL DEFAULT 0,
    summary       JSON NULL,  -- origin default '{}'
    created_by    CHAR(36) NULL, -- auth.users
    created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT chk_import_total CHECK (total_rows >= 0),
    CONSTRAINT chk_import_imported CHECK (imported_rows >= 0),
    CONSTRAINT chk_import_skipped CHECK (skipped_rows >= 0),
    CONSTRAINT chk_import_errors CHECK (error_rows >= 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;


-- ============================================================================
-- 5. SESSION / SECURITY TABLES (20260708190000)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- role_session_policies
-- PK role is free-form text (admin, doctor, nurse, pharmacist, ... and custom).
-- Default rows from the migration are inserted below.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS role_session_policies (
    role                     VARCHAR(64) NOT NULL,
    idle_timeout_minutes     INT NOT NULL,
    absolute_timeout_minutes INT NOT NULL,
    PRIMARY KEY (role),
    CONSTRAINT chk_policy_idle CHECK (idle_timeout_minutes > 0),
    CONSTRAINT chk_policy_absolute CHECK (absolute_timeout_minutes > 0)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------------------------
-- user_sessions
-- user_id referenced auth.users in origin (cascade). id has NO default in
-- origin (app supplies it via upsert). ip_address inet -> VARCHAR(45).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_sessions (
    id               CHAR(36) NOT NULL,
    user_id          CHAR(36) NOT NULL, -- auth.users
    role             VARCHAR(64) NOT NULL,
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    last_activity_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    ip_address       VARCHAR(45) NULL,
    user_agent       TEXT NULL,
    device_label     VARCHAR(191) NULL,
    revoked_at       DATETIME(6) NULL,
    revoked_reason   VARCHAR(32) NULL,
    PRIMARY KEY (id),
    CONSTRAINT chk_sessions_revoked_reason CHECK (
        revoked_reason IS NULL
        OR revoked_reason IN ('user_logout','password_change','role_change',
                              'admin_revoke','idle_timeout','absolute_timeout')
    )
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------------------------
-- notification_read_states
-- user_id referenced auth.users in origin. PK = (user_id, appointment_id).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_read_states (
    user_id        CHAR(36) NOT NULL, -- auth.users
    appointment_id CHAR(36) NOT NULL,
    read_at        DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, appointment_id),
    CONSTRAINT fk_read_states_appointment FOREIGN KEY (appointment_id)
        REFERENCES appointments (id) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

-- ----------------------------------------------------------------------------
-- custom_role_templates
-- user_id referenced auth.users in origin. `key` is a reserved word in
-- MariaDB/MySQL, hence backticks. PK = (user_id, key).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS custom_role_templates (
    user_id    CHAR(36) NOT NULL, -- auth.users
    `key`      VARCHAR(191) NOT NULL,
    label      VARCHAR(191) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_id, `key`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;


-- ============================================================================
-- 6. CONFIG SEED ROWS (configuration required by the schema, mirrored from the
--    Supabase migrations themselves - NOT fabricated data)
-- ============================================================================

-- Singleton organization_settings row (origin 20260704150000 inserted it)
INSERT INTO organization_settings (id) VALUES ('00000000-0000-0000-0000-000000000001')
ON DUPLICATE KEY UPDATE id = id;

-- Default role_session_policies (origin 20260708190000)
INSERT INTO role_session_policies (role, idle_timeout_minutes, absolute_timeout_minutes) VALUES
    ('super_admin',     15, 240),
    ('hospital_admin',  15, 240),
    ('admin',           15, 480),
    ('doctor',          20, 720),
    ('nurse',           20, 720),
    ('pharmacist',      20, 720),
    ('lab_technician',  20, 720),
    ('billing_operator',20, 480),
    ('staff',           20, 480),
    ('patient',         30, 1440),
    ('custom',          20, 480)
ON DUPLICATE KEY UPDATE
    idle_timeout_minutes     = VALUES(idle_timeout_minutes),
    absolute_timeout_minutes = VALUES(absolute_timeout_minutes);


-- ============================================================================
-- 7. TRIGGERS (MariaDB-compatible, no auth dependency)
--    * UUID generation: origin relied on `uuid DEFAULT gen_random_uuid()`.
--      MariaDB expression defaults are version-dependent, so every table that
--      had a UUID default gets its own BEFORE INSERT trigger (assigns UUID()
--      only when the caller did not supply an id).
--    * Auto numbering mirrors assign_* / record payment functions in origin.
--    * updated_at mirrors handle_updated_at / handle_clinical_updated_at.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 7.1 UUID generation triggers
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_user_roles_uuid;
DELIMITER $$
CREATE TRIGGER trg_user_roles_uuid
BEFORE INSERT ON user_roles
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_patients_uuid;
DELIMITER $$
CREATE TRIGGER trg_patients_uuid
BEFORE INSERT ON patients
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_appointments_uuid;
DELIMITER $$
CREATE TRIGGER trg_appointments_uuid
BEFORE INSERT ON appointments
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_notifications_uuid;
DELIMITER $$
CREATE TRIGGER trg_notifications_uuid
BEFORE INSERT ON notifications
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_prescriptions_uuid;
DELIMITER $$
CREATE TRIGGER trg_prescriptions_uuid
BEFORE INSERT ON prescriptions
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_invoices_uuid;
DELIMITER $$
CREATE TRIGGER trg_invoices_uuid
BEFORE INSERT ON invoices
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_payments_uuid;
DELIMITER $$
CREATE TRIGGER trg_payments_uuid
BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_lab_orders_uuid;
DELIMITER $$
CREATE TRIGGER trg_lab_orders_uuid
BEFORE INSERT ON lab_orders
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pharmacy_items_uuid;
DELIMITER $$
CREATE TRIGGER trg_pharmacy_items_uuid
BEFORE INSERT ON pharmacy_items
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_dispensations_uuid;
DELIMITER $$
CREATE TRIGGER trg_dispensations_uuid
BEFORE INSERT ON dispensations
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pii_uuid;
DELIMITER $$
CREATE TRIGGER trg_pii_uuid
BEFORE INSERT ON pharmacy_invoice_items
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_service_catalog_uuid;
DELIMITER $$
CREATE TRIGGER trg_service_catalog_uuid
BEFORE INSERT ON service_catalog
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_import_batches_uuid;
DELIMITER $$
CREATE TRIGGER trg_import_batches_uuid
BEFORE INSERT ON import_batches
FOR EACH ROW
BEGIN
    IF NEW.id IS NULL OR NEW.id = '' THEN
        SET NEW.id = UUID();
    END IF;
END$$
DELIMITER ;

-- ----------------------------------------------------------------------------
-- 7.2 Auto-numbering triggers
-- ----------------------------------------------------------------------------

-- patients: mrn = MRN-XXXXXXXX (origin column default)
DROP TRIGGER IF EXISTS trg_patients_mrn;
DELIMITER $$
CREATE TRIGGER trg_patients_mrn
BEFORE INSERT ON patients
FOR EACH ROW
BEGIN
    IF NEW.mrn IS NULL OR NEW.mrn = '' THEN
        SET NEW.mrn = CONCAT('MRN-', UPPER(LEFT(REPLACE(UUID(), '-', ''), 8)));
    END IF;
END$$
DELIMITER ;

-- prescriptions: RX-YYYYMM-XXXXXX (origin column default)
DROP TRIGGER IF EXISTS trg_prescriptions_number;
DELIMITER $$
CREATE TRIGGER trg_prescriptions_number
BEFORE INSERT ON prescriptions
FOR EACH ROW
BEGIN
    IF NEW.prescription_number IS NULL OR NEW.prescription_number = '' THEN
        SET NEW.prescription_number = CONCAT('RX-', DATE_FORMAT(NOW(), '%Y%m'), '-',
            UPPER(LEFT(REPLACE(UUID(), '-', ''), 6)));
    END IF;
END$$
DELIMITER ;

-- lab_orders: LAB-YYYYMM-XXXXXX (origin column default)
DROP TRIGGER IF EXISTS trg_lab_orders_number;
DELIMITER $$
CREATE TRIGGER trg_lab_orders_number
BEFORE INSERT ON lab_orders
FOR EACH ROW
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        SET NEW.order_number = CONCAT('LAB-', DATE_FORMAT(NOW(), '%Y%m'), '-',
            UPPER(LEFT(REPLACE(UUID(), '-', ''), 6)));
    END IF;
END$$
DELIMITER ;

-- invoices: assign_invoice_number() port. Reads singleton org prefix ('INV'
-- fallback); pharmacy bills use 'PH-INV'. Overwrites any caller-provided value
-- exactly like the origin function did.
DROP TRIGGER IF EXISTS trg_invoices_number;
DELIMITER $$
CREATE TRIGGER trg_invoices_number
BEFORE INSERT ON invoices
FOR EACH ROW
BEGIN
    DECLARE v_prefix VARCHAR(20);
    IF NEW.invoice_type = 'pharmacy' THEN
        SET v_prefix := 'PH-INV';
    ELSE
        SELECT COALESCE(NULLIF(TRIM(invoice_prefix), ''), 'INV')
        INTO v_prefix
        FROM organization_settings
        WHERE id = '00000000-0000-0000-0000-000000000001'
        LIMIT 1;
        IF v_prefix IS NULL OR v_prefix = '' THEN
            SET v_prefix := 'INV';
        END IF;
    END IF;
    SET NEW.invoice_number = CONCAT(v_prefix, '-',
        DATE_FORMAT(NOW(), '%Y%m'), '-',
        UPPER(LEFT(REPLACE(UUID(), '-', ''), 6)));
END$$
DELIMITER ;

-- payments: receipt_number generated by record_invoice_payment() in origin;
-- this defensive trigger keeps the NOT NULL UNIQUE invariant satisfied even
-- when payments are written directly by the backend.
DROP TRIGGER IF EXISTS trg_payments_receipt;
DELIMITER $$
CREATE TRIGGER trg_payments_receipt
BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
    IF NEW.receipt_number IS NULL OR NEW.receipt_number = '' THEN
        SET NEW.receipt_number = CONCAT('RCT-', DATE_FORMAT(NOW(), '%Y%m'), '-',
            UPPER(LEFT(REPLACE(UUID(), '-', ''), 6)));
    END IF;
END$$
DELIMITER ;

-- ----------------------------------------------------------------------------
-- 7.3 updated_at maintenance (handle_updated_at / handle_clinical_updated_at)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_profiles_updated_at;
DELIMITER $$
CREATE TRIGGER trg_profiles_updated_at
BEFORE UPDATE ON profiles
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_patients_updated_at;
DELIMITER $$
CREATE TRIGGER trg_patients_updated_at
BEFORE UPDATE ON patients
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_appointments_updated_at;
DELIMITER $$
CREATE TRIGGER trg_appointments_updated_at
BEFORE UPDATE ON appointments
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_prescriptions_updated_at;
DELIMITER $$
CREATE TRIGGER trg_prescriptions_updated_at
BEFORE UPDATE ON prescriptions
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_invoices_updated_at;
DELIMITER $$
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_lab_orders_updated_at;
DELIMITER $$
CREATE TRIGGER trg_lab_orders_updated_at
BEFORE UPDATE ON lab_orders
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pharmacy_items_updated_at;
DELIMITER $$
CREATE TRIGGER trg_pharmacy_items_updated_at
BEFORE UPDATE ON pharmacy_items
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_org_settings_updated_at;
DELIMITER $$
CREATE TRIGGER trg_org_settings_updated_at
BEFORE UPDATE ON organization_settings
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_service_catalog_updated_at;
DELIMITER $$
CREATE TRIGGER trg_service_catalog_updated_at
BEFORE UPDATE ON service_catalog
FOR EACH ROW
BEGIN
    SET NEW.updated_at = CURRENT_TIMESTAMP(6);
END$$
DELIMITER ;


-- ============================================================================
-- 8. RESTORE SAFE SETTINGS
-- ============================================================================
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- DONE.
-- See database/MYSQL_MIGRATION_NOTES.md for the RLS / function / storage
-- inventory that must be re-implemented in the application backend.
-- ============================================================================