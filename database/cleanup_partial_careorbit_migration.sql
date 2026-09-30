-- ============================================================================
-- CareOrbit - CLEANUP of a partial CareOrbit migration import (MariaDB)
-- ============================================================================
-- Target ........ : Hostinger MariaDB, database `u791891216_careorbit`
-- Purpose ....... : Remove ONLY the objects that careorbit_mysql_migration.sql
--                   creates, so the database can be returned to its original
--                   empty state before re-importing the fixed migration.
--
-- SAFETY
--   * The target database was empty before the first import, so the object
--     list below is exactly the set created by the migration script.
--   * Every statement is guarded with IF EXISTS => safe to re-run.
--   * No DROP DATABASE, no DROP on anything outside this list.
--   * Foreign-key checks are disabled only for the duration of the cleanup
--     and restored afterwards.
--   * Dropping a table also drops its triggers/indexes in MariaDB; triggers
--     are additionally dropped explicitly (IF EXISTS) for cleanliness.
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- 1. TRIGGERS (all 27 created by the migration)
-- ============================================================================
DROP TRIGGER IF EXISTS trg_user_roles_uuid;
DROP TRIGGER IF EXISTS trg_patients_uuid;
DROP TRIGGER IF EXISTS trg_appointments_uuid;
DROP TRIGGER IF EXISTS trg_notifications_uuid;
DROP TRIGGER IF EXISTS trg_prescriptions_uuid;
DROP TRIGGER IF EXISTS trg_invoices_uuid;
DROP TRIGGER IF EXISTS trg_payments_uuid;
DROP TRIGGER IF EXISTS trg_lab_orders_uuid;
DROP TRIGGER IF EXISTS trg_pharmacy_items_uuid;
DROP TRIGGER IF EXISTS trg_dispensations_uuid;
DROP TRIGGER IF EXISTS trg_pii_uuid;
DROP TRIGGER IF EXISTS trg_service_catalog_uuid;
DROP TRIGGER IF EXISTS trg_import_batches_uuid;

DROP TRIGGER IF EXISTS trg_patients_mrn;
DROP TRIGGER IF EXISTS trg_prescriptions_number;
DROP TRIGGER IF EXISTS trg_lab_orders_number;
DROP TRIGGER IF EXISTS trg_invoices_number;
DROP TRIGGER IF EXISTS trg_payments_receipt;

DROP TRIGGER IF EXISTS trg_profiles_updated_at;
DROP TRIGGER IF EXISTS trg_patients_updated_at;
DROP TRIGGER IF EXISTS trg_appointments_updated_at;
DROP TRIGGER IF EXISTS trg_prescriptions_updated_at;
DROP TRIGGER IF EXISTS trg_invoices_updated_at;
DROP TRIGGER IF EXISTS trg_lab_orders_updated_at;
DROP TRIGGER IF EXISTS trg_pharmacy_items_updated_at;
DROP TRIGGER IF EXISTS trg_org_settings_updated_at;
DROP TRIGGER IF EXISTS trg_service_catalog_updated_at;

-- ============================================================================
-- 2. SEED CONFIG DATA (cleanup is handled by dropping the tables below)
-- ============================================================================

-- ============================================================================
-- 3. TABLES (20, dependency order: children first)
-- ============================================================================
DROP TABLE IF EXISTS notification_read_states;
DROP TABLE IF EXISTS custom_role_templates;
DROP TABLE IF EXISTS user_sessions;
DROP TABLE IF EXISTS role_session_policies;
DROP TABLE IF EXISTS import_batches;
DROP TABLE IF EXISTS service_catalog;
DROP TABLE IF EXISTS organization_settings;

DROP TABLE IF EXISTS pharmacy_invoice_items;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS dispensations;
DROP TABLE IF EXISTS pharmacy_items;
DROP TABLE IF EXISTS lab_orders;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS prescriptions;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS patients;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS profiles;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 4. VERIFY EMPTY STATE
--    Should return 0 rows:
--      SELECT table_name FROM information_schema.tables
--      WHERE table_schema = DATABASE();
--    Should return 0 rows:
--      SHOW TRIGGERS;
-- ============================================================================