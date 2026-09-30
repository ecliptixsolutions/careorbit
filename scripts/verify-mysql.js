import "dotenv/config";
import mysql from "mysql2/promise";

const expected = [
  "profiles",
  "user_roles",
  "patients",
  "appointments",
  "notifications",
  "prescriptions",
  "invoices",
  "payments",
  "lab_orders",
  "pharmacy_items",
  "dispensations",
  "audit_logs",
  "pharmacy_invoice_items",
  "organization_settings",
  "service_catalog",
  "import_batches",
  "role_session_policies",
  "user_sessions",
  "notification_read_states",
  "custom_role_templates",
];
const config = {
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
};
if (Object.values(config).some((value) => !value)) {
  console.error("MySQL environment variables are required; no database was changed.");
  process.exit(2);
}
const db = await mysql.createConnection(config);
try {
  const [[{ name }]] = await db.query("SELECT DATABASE() name");
  const [tables] = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE'",
  );
  const [[{ triggers }]] = await db.query(
    "SELECT COUNT(*) triggers FROM information_schema.triggers WHERE trigger_schema=DATABASE()",
  );
  const [[{ foreignKeys }]] = await db.query(
    "SELECT COUNT(*) foreignKeys FROM information_schema.key_column_usage WHERE table_schema=DATABASE() AND referenced_table_name IS NOT NULL",
  );
  const [[{ indexes }]] = await db.query(
    "SELECT COUNT(*) indexes FROM information_schema.statistics WHERE table_schema=DATABASE()",
  );
  const found = new Set(tables.map((row) => row.TABLE_NAME));
  const absent = expected.filter((table) => !found.has(table));
  console.log(
    `CAREORBIT MYSQL VERIFICATION\n===========================\nDatabase: ${name}\nConnection: PASS\nTables: ${expected.length - absent.length} / ${expected.length}${absent.length ? ` (missing: ${absent.join(", ")})` : " PASS"}\nTriggers: ${triggers}\nForeign keys: ${foreignKeys}\nIndexes: ${indexes}\nSchema migration: ${absent.length ? "PARTIAL" : "ALREADY COMPLETE"}`,
  );
} finally {
  await db.end();
}
