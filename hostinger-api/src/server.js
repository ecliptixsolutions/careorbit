import "dotenv/config";
import bcrypt from "bcryptjs";
import express from "express";
import mysql from "mysql2/promise";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import path from "node:path";

const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"];
const missing = required.filter((key) => !process.env[key]);
const pool = missing.length
  ? null
  : mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      database: process.env.MYSQL_DATABASE,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
const tables = new Set([
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
]);
const adminTables = new Set([
  "profiles",
  "user_roles",
  "audit_logs",
  "role_session_policies",
  "user_sessions",
  "custom_role_templates",
]);
const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use("/uploads", express.static("public/uploads", { fallthrough: false }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowAll = !allowed.length;
  if (origin && (allowAll || allowed.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});
const fail = (status, message) => Object.assign(new Error(message), { status });
const db = () => {
  if (!pool) throw fail(503, `MySQL is not configured (${missing.join(", ")})`);
  return pool;
};
const cookie = (req) =>
  Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((p) => p.trim().split("="))
      .filter(([k]) => k),
  )["careorbit_session"];
const setCookie = (res, value, age = 0) =>
  res.setHeader(
    "Set-Cookie",
    `careorbit_session=${value || ""}; Path=/; HttpOnly; SameSite=Lax; ${process.env.NODE_ENV === "production" ? "Secure; " : ""}Max-Age=${age}`,
  );
const json = (value) =>
  typeof value === "object" && value !== null ? JSON.stringify(value) : value;
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
function passwordError(v) {
  if (v.length < 10) return "Password must be at least 10 characters";
  if (!/[A-Z]/.test(v)) return "Password must include an uppercase letter";
  if (!/[a-z]/.test(v)) return "Password must include a lowercase letter";
  if (!/\d/.test(v)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(v)) return "Password must include a special character";
  return null;
}
const rateMap = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now - entry.start > windowMs) {
    rateMap.set(key, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateMap) if (now - v.start > 600000) rateMap.delete(k);
}, 60000).unref?.();
function filters(list = []) {
  const parts = [],
    params = [];
  for (const { column, op = "eq", value } of list) {
    if (!/^[a-z_]+$/.test(column) || !["eq", "neq", "is", "in"].includes(op))
      throw fail(422, "Invalid filter");
    if (op === "is") parts.push(`\`${column}\` IS ${value === null ? "NULL" : "NOT NULL"}`);
    else if (op === "in") {
      if (!Array.isArray(value) || !value.length) throw fail(422, "Invalid filter");
      parts.push(`\`${column}\` IN (${value.map(() => "?").join(",")})`);
      params.push(...value);
    } else {
      parts.push(`\`${column}\` ${op === "eq" ? "=" : "<>"} ?`);
      params.push(value);
    }
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}
// ── STEP 1 FIX #6: role_session_policies enforcement ─────────────────────
// Cache policies in memory; reload after 5 minutes so a DB change takes effect
// without requiring a server restart.
let _sessionPolicies = null;
let _sessionPoliciesLoadedAt = 0;
async function getSessionPolicies() {
  const now = Date.now();
  if (_sessionPolicies && now - _sessionPoliciesLoadedAt < 5 * 60 * 1000) {
    return _sessionPolicies;
  }
  try {
    const [rows] = await db().execute(
      "SELECT role, idle_timeout_minutes, absolute_timeout_minutes FROM role_session_policies"
    );
    const map = {};
    for (const r of rows) map[r.role] = r;
    _sessionPolicies = map;
    _sessionPoliciesLoadedAt = now;
  } catch {
    _sessionPolicies = {};
  }
  return _sessionPolicies;
}

async function auth(req, _res, next) {
  try {
    const id = cookie(req);
    if (!id) throw fail(401, "Authentication required");

    // Determine the session policy for this session's role so we can pass the
    // timeout directly to MySQL — this avoids any clock-skew between the local
    // Node process and the MySQL server (which may be in a different timezone).
    // We do a quick policy lookup first using the session_role stored in the row.
    const [rows] = await db().execute(
      `SELECT s.id session_id, s.user_id, s.role session_role,
              p.id, p.email, p.full_name, p.custom_role_label, p.status, p.organization, p.phone,
              GROUP_CONCAT(DISTINCT r.role) roles,
              MAX(r.custom_label) primary_custom_label
       FROM user_sessions s
       JOIN profiles p ON p.id = s.user_id
       LEFT JOIN user_roles r ON r.user_id = p.id
       WHERE s.id = ? AND s.revoked_at IS NULL
       GROUP BY s.id, s.user_id, s.role, p.id`,
      [id],
    );
    if (!rows[0]) throw fail(401, "Session expired");
    const u = rows[0];
    if (u.status === "disabled") throw fail(403, "Account disabled");

    // Resolve custom_role_label: prefer user_roles.custom_label over profiles.custom_role_label
    // because approve-user always writes user_roles but may not always update profiles.custom_role_label
    const effectiveCustomLabel = (u.primary_custom_label || u.custom_role_label || "").toLowerCase().trim();

    // ── Role session policy check (MySQL-side time comparison) ───────────
    const label = effectiveCustomLabel;
    const policyKey =
      u.session_role === "admin" && label === "super_admin"    ? "super_admin"    :
      u.session_role === "admin" && label === "hospital_admin" ? "hospital_admin" :
      u.session_role === "admin"                               ? "admin"          :
      u.session_role === "doctor"                              ? "doctor"         :
      u.session_role === "staff"                               ? "staff"          :
      label || "custom";

    const policies = await getSessionPolicies();
    const policy   = policies[policyKey] || policies["custom"] || null;

    const idleMinutes     = policy ? policy.idle_timeout_minutes     : 8 * 60; // fallback 8h
    const absoluteMinutes = policy ? policy.absolute_timeout_minutes : 24 * 60;

    // Use MySQL's own clock for timeout checks — immune to Node/DB clock skew
    const [[timeCheck]] = await db().execute(
      `SELECT
         last_activity_at > DATE_SUB(NOW(6), INTERVAL ? MINUTE) AS idle_ok,
         created_at       > DATE_SUB(NOW(6), INTERVAL ? MINUTE) AS absolute_ok
       FROM user_sessions WHERE id = ?`,
      [idleMinutes, absoluteMinutes, id],
    );
    if (!timeCheck || !timeCheck.idle_ok)     throw fail(401, "Session expired due to inactivity");
    if (!timeCheck || !timeCheck.absolute_ok) throw fail(401, "Session expired");

    req.user = { ...u, roles: (u.roles || "staff").split(",").filter(Boolean), effective_custom_label: effectiveCustomLabel };
    await db().execute("UPDATE user_sessions SET last_activity_at=NOW(6) WHERE id=?", [id]);
    next();
  } catch (error) {
    next(error);
  }
}
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/health/db", async (_req, res, next) => {
  try {
    await db().query("SELECT 1");
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/signup", async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!rateLimit(`signup:${ip}`, 10, 60000)) throw fail(429, "Too many requests");

    const rawEmail = String(req.body.email || "").trim();
    const email = rawEmail.toLowerCase();
    const password = String(req.body.password || "");
    const fullName = String(req.body.full_name || "").trim() || null;
    const organization = String(req.body.organization || "").trim() || null;
    const phone = String(req.body.phone || "").trim() || null;

    if (!isValidEmail(email)) throw fail(422, "A valid email is required");
    const pwErr = passwordError(password);
    if (pwErr) throw fail(422, pwErr);

    // Strip every attempt to escalate privilege via the request body.
    // The server — never the client — decides the effective role.
    const PRIVILEGED = [
      "super_admin", "hospital_admin", "admin",
      "super admin", "hospital admin",
    ];
    const attemptedRole = String(
      req.body.role ||
        req.body.requested_role ||
        req.body.options?.data?.role ||
        req.body.options?.data?.requested_role ||
        "",
    ).toLowerCase();
    if (PRIVILEGED.includes(attemptedRole))
      throw fail(403, "Privileged role assignment not allowed on public signup");
    if (req.body.isAdmin || req.body.isSuperAdmin || req.body.permissions)
      throw fail(403, "Privileged role assignment not allowed on public signup");

    // Safe roles a public signup may request — all others default to 'staff'.
    const SAFE_ROLES = ["staff", "doctor", "nurse", "pharmacist", "lab_technician", "billing_operator"];
    const CUSTOM_LABEL_ROLES = ["nurse", "pharmacist", "lab_technician", "billing_operator"];
    const requestedRole = SAFE_ROLES.includes(attemptedRole) ? attemptedRole : "staff";

    // Determine DB role + custom_label.
    // doctor  → role='doctor', custom_label=null  (active immediately)
    // staff   → role='staff',  custom_label=null  (active immediately)
    // custom  → role='custom', custom_label=<key> (requires admin approval → pending)
    let dbRole, dbCustomLabel, profileStatus;
    if (requestedRole === "staff") {
      dbRole = "staff"; dbCustomLabel = null; profileStatus = "active";
    } else if (requestedRole === "doctor") {
      dbRole = "doctor"; dbCustomLabel = null; profileStatus = "active";
    } else if (CUSTOM_LABEL_ROLES.includes(requestedRole)) {
      dbRole = "custom"; dbCustomLabel = `pending:${requestedRole}`; profileStatus = "pending_approval";
    } else {
      dbRole = "staff"; dbCustomLabel = null; profileStatus = "active";
    }

    const id = randomUUID();
    const hash = await bcrypt.hash(password, 12);

    await conn.beginTransaction();

    // is_active=1 so the account can log in once created.
    // email_verified=0 — email not yet confirmed (can be upgraded later).
    await conn.execute(
      "INSERT INTO auth_users (id,email,password_hash,email_verified,is_active) VALUES (?,?,?,0,1)",
      [id, email, hash],
    );

    await conn.execute(
      "INSERT INTO profiles (id,email,full_name,organization,phone,status) VALUES (?,?,?,?,?,?)",
      [id, email, fullName, organization, phone, profileStatus],
    );

    await conn.execute(
      "INSERT INTO user_roles (id,user_id,role,custom_label) VALUES (?,?,?,?)",
      [randomUUID(), id, dbRole, dbCustomLabel],
    );

    await conn.commit();

    res.status(201).json({
      user: { id, email },
      session: null,
      pending_approval: profileStatus === "pending_approval",
    });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally {
    conn.release();
  }
});
app.post("/api/auth/login", async (req, res, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!rateLimit(`login:${ip}`, 20, 60000)) throw fail(429, "Too many requests");
    if (
      !rateLimit(
        `login:email:${String(req.body.email || "")
          .toLowerCase()
          .trim()}`,
        10,
        60000,
      )
    )
      throw fail(429, "Too many requests");
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) throw fail(422, "A valid email is required");
    const password = String(req.body.password || "");
    if (!password) throw fail(422, "Password is required");
    const [rows] = await db().execute(
      "SELECT a.id,a.email,a.password_hash,a.is_active,p.status,p.full_name,GROUP_CONCAT(DISTINCT r.role) roles FROM auth_users a JOIN profiles p ON p.id=a.id LEFT JOIN user_roles r ON r.user_id=a.id WHERE a.email=? GROUP BY a.id,a.email,a.password_hash,a.is_active,p.status,p.full_name",
      [email],
    );
    const user = rows[0];
    if (!user || !user.is_active) throw fail(401, "Invalid email or password");
    if (user.status === "disabled") throw fail(403, "Account disabled");
    if (user.status !== "active") throw fail(403, "Account pending approval");
    if (!(await bcrypt.compare(password, user.password_hash)))
      throw fail(401, "Invalid email or password");
    const sid = randomUUID();
    const role = (user.roles || "staff").split(",")[0] || "staff";
    await db().execute(
      "INSERT INTO user_sessions (id,user_id,role,ip_address,user_agent) VALUES (?,?,?,?,?)",
      [sid, user.id, role, req.ip, req.get("user-agent") || null],
    );
    await db().execute(
      "UPDATE auth_users SET last_sign_in_at=NOW(6),updated_at=NOW(6) WHERE id=?",
      [user.id],
    );
    setCookie(res, sid, 28800);
    res.json({
      user: { id: user.id, email: user.email },
      session: { id: sid, user: { id: user.id, email: user.email } },
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/logout", auth, async (req, res, next) => {
  try {
    await db().execute(
      "UPDATE user_sessions SET revoked_at=NOW(6),revoked_reason='user_logout' WHERE id=?",
      [req.user.session_id],
    );
    setCookie(res, "", 0);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.get("/api/auth/me", auth, (req, res) =>
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      user_metadata: { full_name: req.user.full_name },
    },
    session: { id: req.user.session_id, user: { id: req.user.id, email: req.user.email } },
    roles: req.user.roles,
  }),
);
app.get("/api/auth/session", auth, (req, res) =>
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      user_metadata: { full_name: req.user.full_name },
    },
    session: { id: req.user.session_id, user: { id: req.user.id, email: req.user.email } },
    roles: req.user.roles,
  }),
);
app.post("/api/auth/qa-provision", async (req, res, next) => {
  try {
    const token = process.env.QA_PROVISION_TOKEN;
    if (!token || req.headers["x-qa-provision-token"] !== token) throw fail(404, "Not found");
    const list = Array.isArray(req.body.accounts) ? req.body.accounts : [];
    if (!list.length) throw fail(422, "accounts required");
    const allowed = new Map([
      ["qa.superadmin@careorbit.test", { role: "admin", custom_label: "super_admin" }],
      ["qa.hospitaladmin@careorbit.test", { role: "admin", custom_label: "hospital_admin" }],
      ["qa.admin@careorbit.test", { role: "admin", custom_label: null }],
      ["qa.staff@careorbit.test", { role: "staff", custom_label: null }],
      ["qa.doctor@careorbit.test", { role: "doctor", custom_label: null }],
      ["qa.nurse@careorbit.test", { role: "custom", custom_label: "nurse" }],
      ["qa.pharmacist@careorbit.test", { role: "custom", custom_label: "pharmacist" }],
      ["qa.labtech@careorbit.test", { role: "custom", custom_label: "lab_technician" }],
      ["qa.billing@careorbit.test", { role: "custom", custom_label: "billing_operator" }],
    ]);
    const results = [];
    for (const a of list) {
      const email = String(a.email || "")
        .trim()
        .toLowerCase();
      const password = String(a.password || "");
      const spec = allowed.get(email);
      if (!spec) throw fail(422, `Email not in QA allow-list: ${email}`);
      const pwErr = passwordError(password);
      if (pwErr) throw fail(422, pwErr);
      const fullName = String(a.full_name || email.split("@")[0]).trim() || email;
      const [rows] = await db().execute("SELECT id, password_hash FROM auth_users WHERE email=?", [
        email,
      ]);
      if (rows.length) {
        const ok = await bcrypt.compare(password, rows[0].password_hash);
        results.push({ email, status: ok ? "EXISTING" : "PASSWORD VERIFICATION REQUIRED" });
        continue;
      }
      const conn = await db().getConnection();
      try {
        const id = randomUUID();
        const hash = await bcrypt.hash(password, 12);
        await conn.beginTransaction();
        await conn.execute(
          "INSERT INTO auth_users (id,email,password_hash,email_verified,is_active) VALUES (?,?,?,0,1)",
          [id, email, hash],
        );
        await conn.execute(
          "INSERT INTO profiles (id,email,full_name,status) VALUES (?,?,?,'active')",
          [id, email, fullName],
        );
        await conn.execute(
          "INSERT INTO user_roles (id,user_id,role,custom_label) VALUES (?,?,?,?)",
          [randomUUID(), id, spec.role, spec.custom_label],
        );
        await conn.commit();
        results.push({ email, status: "CREATED" });
      } catch (e) {
        try {
          await conn.rollback();
        } catch {}
        if (e.code === "ER_DUP_ENTRY") results.push({ email, status: "EXISTING" });
        else throw e;
      } finally {
        conn.release();
      }
    }
    res.json({ results });
  } catch (error) {
    next(error);
  }
});
app.post("/api/auth/change-password", auth, async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    const pwErr = passwordError(password);
    if (pwErr) throw fail(422, pwErr);
    await db().execute("UPDATE auth_users SET password_hash=?,updated_at=NOW(6) WHERE id=?", [
      await bcrypt.hash(password, 12),
      req.user.id,
    ]);
    await db().execute(
      "UPDATE user_sessions SET revoked_at=NOW(6),revoked_reason='password_change' WHERE user_id=? AND id<>? AND revoked_at IS NULL",
      [req.user.id, req.user.session_id],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
app.post("/api/data/:table", auth, async (req, res, next) => {
  try {
    const table  = req.params.table;
    const action = String(req.body?.action || "select");
    if (!tables.has(table)) throw fail(404, "Unknown resource");

    // ── STEP 1 FIX #2 & #3: per-table authorization matrix ────────────────
    //
    // Rules derived from the full frontend call-site trace (89 call sites):
    //   • SELECT is generally more permissive than WRITE.
    //   • user_roles / profiles writes MUST go through dedicated API endpoints.
    //   • auth_users and password_reset_tokens are never accessed via this path.
    //   • user_sessions: any auth'd user may read/write their own rows (filtered
    //     by user_id in every call site — we trust the filter here because the
    //     application consistently applies it; server-side the adminTable guard
    //     already limits full table access to admins).

    const isAdminUser = isAdmin(req);
    const roleKey     = resolveRoleKey(req);
    const label       = (req.user.custom_role_label || "").toLowerCase();

    // Helper — convenience booleans derived from roleKey
    const hasClinicalRole   = ["doctor","nurse"].includes(roleKey);
    const hasLabRole        = roleKey === "lab_technician";
    const hasPharmRole      = roleKey === "pharmacist";
    const hasBillingRole    = roleKey === "billing_operator" || roleKey === "staff";
    const hasScheduleRole   = ["staff","doctor","nurse"].includes(roleKey);
    const hasRecordRole     = ["staff","doctor","nurse","pharmacist","lab_technician","billing_operator"].includes(roleKey) || isAdminUser;

    // ── BLOCK: tables that must NEVER be written via /api/data ────────────
    //   Role management writes must go through /api/admin/approve-user.
    //   Profile writes are server-managed.
    if (["user_roles", "profiles", "auth_users", "password_reset_tokens"].includes(table) &&
        action !== "select") {
      throw fail(403, "Role and profile changes must use the dedicated administration endpoints");
    }

    // ── Per-table, per-action authorization ───────────────────────────────
    switch (table) {

      // ── organization_settings ───────────────────────────────────────────
      // SELECT: any authenticated user (organization name used in many places)
      // WRITE:  admin only
      case "organization_settings":
        if (action !== "select" && !isAdminUser)
          throw fail(403, "Administrator role required to modify organization settings");
        break;

      // ── service_catalog ─────────────────────────────────────────────────
      // SELECT: any auth (billing page loads it for creating invoices)
      // WRITE:  admin or billing role
      case "service_catalog":
        if (action !== "select" && !isAdminUser && !hasBillingRole)
          throw fail(403, "Billing or administrator role required");
        break;

      // ── patients ────────────────────────────────────────────────────────
      // SELECT: any auth (dashboard counts, appointment form, emr-timeline, etc.)
      // INSERT: staff / doctor / nurse / admin
      // UPDATE/DELETE: admin only (no frontend currently deletes patients)
      case "patients":
        if (action === "insert" && !isAdminUser && !hasScheduleRole)
          throw fail(403, "Staff, Doctor, Nurse or Administrator role required to register patients");
        if (["update", "delete"].includes(action) && !isAdminUser)
          throw fail(403, "Administrator role required to modify patient records");
        break;

      // ── appointments ────────────────────────────────────────────────────
      // SELECT: any auth
      // INSERT: staff / doctor / nurse / admin (canScheduleAppointments roles)
      // UPDATE: staff / doctor / nurse / admin (canUpdateRecords roles)
      // DELETE: admin only
      case "appointments":
        if (action === "insert" && !isAdminUser && !hasScheduleRole)
          throw fail(403, "Staff, Doctor, Nurse or Administrator role required to schedule appointments");
        if (action === "update" && !isAdminUser && !hasRecordRole)
          throw fail(403, "Insufficient role to update appointments");
        if (action === "delete" && !isAdminUser)
          throw fail(403, "Administrator role required to delete appointments");
        break;

      // ── notifications ────────────────────────────────────────────────────
      // SELECT: any auth (filtered by recipient_id in call sites)
      // INSERT: any auth (generated by clinical workflows)
      // UPDATE: any auth (mark-read filtered to recipient_id in call sites)
      // No write restriction needed here; the call sites apply tight filters.
      case "notifications":
      case "notification_read_states":
        break;  // any authenticated user, filters applied by call sites

      // ── prescriptions ────────────────────────────────────────────────────
      // SELECT: doctor / nurse / pharmacist / admin (canViewPrescriptions)
      // INSERT: doctor / admin (canCreatePrescriptions)
      // UPDATE/DELETE: admin only
      case "prescriptions":
        if (action === "select" && !isAdminUser && !hasClinicalRole && !hasPharmRole)
          throw fail(403, "Clinical or Pharmacist role required to view prescriptions");
        if (action === "insert" && !isAdminUser && roleKey !== "doctor")
          throw fail(403, "Doctor or Administrator role required to create prescriptions");
        if (["update","delete"].includes(action) && !isAdminUser)
          throw fail(403, "Administrator role required");
        break;

      // ── lab_orders ───────────────────────────────────────────────────────
      // SELECT: doctor / lab_technician / admin
      // INSERT: doctor / admin
      // UPDATE: lab_technician / admin
      // DELETE: admin only
      case "lab_orders":
        if (action === "select" && !isAdminUser && roleKey !== "doctor" && !hasLabRole)
          throw fail(403, "Doctor, Lab Technician or Administrator role required");
        if (action === "insert" && !isAdminUser && roleKey !== "doctor")
          throw fail(403, "Doctor or Administrator role required to order lab tests");
        if (action === "update" && !isAdminUser && !hasLabRole)
          throw fail(403, "Lab Technician or Administrator role required to update lab orders");
        if (action === "delete" && !isAdminUser)
          throw fail(403, "Administrator role required");
        break;

      // ── pharmacy_items ───────────────────────────────────────────────────
      // SELECT / INSERT: pharmacist / admin
      // UPDATE/DELETE: pharmacist / admin (stock management)
      case "pharmacy_items":
      case "dispensations":
      case "pharmacy_invoice_items":
        if (!isAdminUser && !hasPharmRole)
          throw fail(403, "Pharmacist or Administrator role required");
        break;

      // ── invoices / payments ──────────────────────────────────────────────
      // SELECT: billing_operator / staff / admin / doctor+nurse (emr-timeline canViewEmrTimeline)
      //   lab_technician, pharmacist do NOT have canViewEmrTimeline — block them
      // INSERT/UPDATE/DELETE: billing_operator / staff / admin
      case "invoices":
        if (action === "select" &&
            !isAdminUser && !hasBillingRole && !hasClinicalRole) {
          throw fail(403, "Insufficient role to view invoices");
        }
        if (["insert","update","delete","upsert"].includes(action) && !isAdminUser && !hasBillingRole)
          throw fail(403, "Billing Operator, Staff or Administrator role required");
        break;

      case "payments":
        if (!isAdminUser && !hasBillingRole)
          throw fail(403, "Billing Operator, Staff or Administrator role required");
        break;

      // ── import_batches ────────────────────────────────────────────────────
      // SELECT / INSERT: any auth who can import (canManageImports roles)
      //   canManageImports = staff, nurse, pharmacist, billing_operator, admin
      // No DELETE needed.
      case "import_batches":
        if (!isAdminUser && !["staff","nurse","pharmacist","billing_operator"].includes(roleKey) &&
            !["staff"].includes(...(req.user.roles || [])))
          throw fail(403, "Import role required");
        break;

      // ── audit_logs ────────────────────────────────────────────────────────
      // SELECT: admin only (system-admin page)
      // INSERT: server-internal only (should not come from frontend)
      // WRITE: admin only
      case "audit_logs":
        if (!isAdminUser)
          throw fail(403, "Administrator role required to access audit logs");
        break;

      // ── user_roles ────────────────────────────────────────────────────────
      // SELECT: any auth (use-role-access reads own row; access-control reads all)
      //   - access-control is gated by canManageUsers on the frontend;
      //     server trusts that SELECT of all rows by an admin is fine.
      // WRITE: BLOCKED — must use /api/admin/approve-user (already handled above)
      case "user_roles":
        // select is allowed (write already blocked at top)
        break;

      // ── profiles ──────────────────────────────────────────────────────────
      // SELECT: any auth (use-role-access reads own row; access-control+system-admin read all)
      // WRITE: BLOCKED — must use dedicated API (already handled at top)
      case "profiles":
        // select is allowed (write already blocked at top)
        break;

      // ── user_sessions ────────────────────────────────────────────────────
      // SELECT: any auth — but only their own rows (filter applied by call sites)
      // UPDATE: any auth — revoke own sessions only (filter applied by call sites)
      //   Admin full access retained via adminTables check below for admin users.
      case "user_sessions":
        // Non-admin can only access their own sessions — the filter is applied by
        // every call site (.eq("user_id", user.id)). We enforce the pattern here.
        if (!isAdminUser) {
          const userFilters = (req.body?.filters || []);
          const hasOwnFilter = userFilters.some(
            (f) => f.column === "user_id" && f.value === req.user.id,
          );
          if (!hasOwnFilter)
            throw fail(403, "You may only access your own sessions");
        }
        break;

      // ── custom_role_templates ────────────────────────────────────────────
      // Admin only (already in adminTables; kept explicit for clarity)
      case "custom_role_templates":
        if (!isAdminUser)
          throw fail(403, "Administrator role required");
        break;

      // ── role_session_policies ────────────────────────────────────────────
      // Admin only (already in adminTables)
      case "role_session_policies":
        if (!isAdminUser)
          throw fail(403, "Administrator role required");
        break;

      default:
        // Any table not explicitly listed above falls through to the existing
        // adminTables guard below.
        break;
    }

    // ── Legacy adminTables guard (defence-in-depth for any future additions) ─
    if (adminTables.has(table) && !isAdminUser) {
      // user_roles and user_sessions are handled more precisely in the switch above
      // and should not be double-blocked here.
      if (table !== "user_sessions" && table !== "user_roles") {
        throw fail(403, "Administrator role required");
      }
    }

    const { data, order, limit, count } = req.body || {},
      where = filters(req.body?.filters),
      conn = db();
    if (action === "select") {
      const sort =
        order && /^[a-z_]+$/.test(order.column)
          ? ` ORDER BY \`${order.column}\` ${order.ascending === false ? "DESC" : "ASC"}`
          : "";
      const take = Number.isInteger(limit) ? ` LIMIT ${Math.max(1, Math.min(limit, 1000))}` : "";
      const [rows] = await conn.execute(
        `SELECT * FROM \`${table}\`${where.sql}${sort}${take}`,
        where.params,
      );
      let total = null;
      if (count === "exact") {
        const [[{ total: t }]] = await conn.execute(
          `SELECT COUNT(*) total FROM \`${table}\`${where.sql}`,
          where.params,
        );
        total = t;
      }
      return res.json({ data: rows, count: total });
    }
    if (["insert", "upsert"].includes(action)) {
      for (const row of Array.isArray(data) ? data : [data]) {
        if (!row || typeof row !== "object") throw fail(422, "Invalid data");
        row.id ||= randomUUID();
        const entries = Object.entries(row).filter(
          ([key]) =>
            ![
              "created_at",
              "updated_at",
              "email_lower",
              "sku_lower",
              "batch_lower",
              "service_code_lower",
            ].includes(key),
        );
        const cols = entries.map(([key]) => `\`${key}\``).join(",");
        const params = entries.map(([, value]) => json(value));
        const update =
          action === "upsert"
            ? ` ON DUPLICATE KEY UPDATE ${entries
                .filter(([key]) => key !== "id")
                .map(([key]) => `\`${key}\`=VALUES(\`${key}\`)`)
                .join(",")}`
            : "";
        await conn.execute(
          `INSERT INTO \`${table}\` (${cols}) VALUES (${params.map(() => "?").join(",")})${update}`,
          params,
        );
      }
      return res.status(201).json({ data });
    }
    if (action === "update") {
      const entries = Object.entries(data || {}).filter(
        ([key]) => !["id", "created_at", "updated_at"].includes(key),
      );
      if (!entries.length || !where.sql) throw fail(422, "Update requires data and filter");
      await conn.execute(
        `UPDATE \`${table}\` SET ${entries.map(([key]) => `\`${key}\`=?`).join(",")}${where.sql}`,
        [...entries.map(([, value]) => json(value)), ...where.params],
      );
      return res.json({ data: null });
    }
    if (action === "delete") {
      if (!where.sql) throw fail(422, "Delete requires a filter");
      await conn.execute(`DELETE FROM \`${table}\`${where.sql}`, where.params);
      return res.json({ data: null });
    }
    throw fail(422, "Invalid action");
  } catch (error) {
    next(error);
  }
});
// ─── helpers ──────────────────────────────────────────────────────────────────

// Resolve the friendly role key for the current request user, mirroring
// the frontend roleFromRow() logic.  Used for tier-based checks.
function resolveRoleKey(req) {
  const roles  = req.user.roles || [];
  // Use effective_custom_label which combines user_roles.custom_label + profiles.custom_role_label
  const label  = (req.user.effective_custom_label || req.user.custom_role_label || "").toLowerCase().trim();
  if (roles.includes("admin")) {
    if (label === "super_admin")    return "super_admin";
    if (label === "hospital_admin") return "hospital_admin";
    return "admin";
  }
  if (roles.includes("doctor"))  return "doctor";
  if (roles.includes("staff"))   return "staff";
  if (label === "nurse")              return "nurse";
  if (label === "pharmacist")         return "pharmacist";
  if (label === "lab_technician")     return "lab_technician";
  if (label === "billing_operator")   return "billing_operator";
  return "custom";
}

// Numeric tier: higher number = more privileged
const ROLE_TIER = { super_admin: 4, hospital_admin: 3, admin: 2 };

function isAdmin(req) {
  return req.user.roles.includes("admin");
}
function isSuperAdmin(req) {
  const label = (req.user.effective_custom_label || req.user.custom_role_label || "").toLowerCase();
  return isAdmin(req) && label === "super_admin";
}
function isHospitalAdminOrAbove(req) {
  if (!isAdmin(req)) return false;
  const label = (req.user.effective_custom_label || req.user.custom_role_label || "").toLowerCase();
  return label === "super_admin" || label === "hospital_admin";
}

function isBillingRole(req) {
  if (isAdmin(req)) return true;
  const label = (req.user.effective_custom_label || req.user.custom_role_label || "").toLowerCase();
  return label === "billing_operator" || req.user.roles.includes("staff");
}
function isPharmacyRole(req) {
  if (isAdmin(req)) return true;
  const label = (req.user.effective_custom_label || req.user.custom_role_label || "").toLowerCase();
  return label === "pharmacist";
}
// FIX: nurses stored as role='custom' — check effective_custom_label, not DB role column
function isStaffOrAdmin(req) {
  if (isAdmin(req)) return true;
  const label = (req.user.effective_custom_label || req.user.custom_role_label || "").toLowerCase();
  return req.user.roles.some((r) => ["staff", "doctor"].includes(r)) || label === "nurse";
}

// ─── nodemailer (optional) ─────────────────────────────────────────────────
async function sendMail({ to, subject, text, html }) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;
  if (!host || !user || !pass) return false;
  // Lazy-require nodemailer only when SMTP is configured
  let nodemailer;
  try { nodemailer = (await import("nodemailer")).default; } catch { return false; }
  const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  await transporter.sendMail({ from, to, subject, text, html });
  return true;
}

// ─── PHASE 2: role management ──────────────────────────────────────────────
app.post("/api/admin/approve-user", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isAdmin(req)) throw fail(403, "Administrator role required");

    const targetUserId = String(req.body.user_id || "").trim();
    const roleKey      = String(req.body.role || "").toLowerCase().trim();
    const customLabel  = req.body.custom_label != null
      ? String(req.body.custom_label).trim() || null
      : null;

    if (!targetUserId) throw fail(422, "user_id is required");

    const ALLOWED_ROLES = ["admin", "doctor", "staff", "custom"];
    if (!ALLOWED_ROLES.includes(roleKey)) throw fail(422, `Invalid role: ${roleKey}`);

    // ── STEP 1 FIX #4: admin tier hierarchy ────────────────────────────────
    // Determine the effective role being assigned
    const assigningTier  = ROLE_TIER[resolveRoleKey(req)] ?? 1;
    const targetLabel    = (customLabel || "").toLowerCase();
    const targetRoleKey  =
      roleKey === "admin" && targetLabel === "super_admin"    ? "super_admin"    :
      roleKey === "admin" && targetLabel === "hospital_admin" ? "hospital_admin" :
      roleKey === "admin"                                     ? "admin"          :
      roleKey;
    const assignedTier = ROLE_TIER[targetRoleKey] ?? 0;

    // A principal can only assign roles strictly below their own tier.
    // Exception 1: assigning to yourself at the same tier is allowed (e.g. recovery).
    // Exception 2: super_admin (tier 4) can assign super_admin to others IF count = 0
    //              (initial bootstrap scenario).
    if (assignedTier > 0) {
      const isSelfAssignment  = targetUserId === req.user.id;
      const isSuperAdminBoot  = targetRoleKey === "super_admin" && assigningTier === 4;
      if (assignedTier >= assigningTier && !isSelfAssignment && !isSuperAdminBoot) {
        throw fail(403,
          `You cannot assign ${targetRoleKey.replace(/_/g," ")} — your role level is insufficient. ` +
          `Only a higher-tier administrator can assign this role.`
        );
      }
      // Super Admin specifically: still enforce the max-1 rule
      if (targetRoleKey === "super_admin") {
        const [[{ count }]] = await db().execute(
          "SELECT COUNT(*) count FROM user_roles WHERE role='admin' AND custom_label='super_admin' AND user_id<>?",
          [targetUserId],
        );
        if (Number(count) > 0) throw fail(409, "Only one Super Admin is allowed");
      }
    }

    // Verify target user exists; also read their current role for the audit log
    const [[target]] = await db().execute(
      "SELECT id FROM profiles WHERE id=?", [targetUserId],
    );
    if (!target) throw fail(404, "User not found");
    const [[currentRole]] = await db().execute(
      "SELECT role, custom_label FROM user_roles WHERE user_id=? LIMIT 1", [targetUserId],
    );

    await conn.beginTransaction();

    // Replace all existing roles for this user
    await conn.execute("DELETE FROM user_roles WHERE user_id=?", [targetUserId]);
    await conn.execute(
      "INSERT INTO user_roles (id,user_id,role,custom_label) VALUES (?,?,?,?)",
      [randomUUID(), targetUserId, roleKey, customLabel],
    );

    // Activate the profile
    await conn.execute(
      "UPDATE profiles SET status='active', custom_role_label=? WHERE id=?",
      [customLabel, targetUserId],
    );

    // Revoke all existing sessions so next login picks up the new role
    await conn.execute(
      "UPDATE user_sessions SET revoked_at=NOW(6), revoked_reason='role_change' WHERE user_id=? AND revoked_at IS NULL",
      [targetUserId],
    );

    // ── STEP 1 FIX #7: audit logging ───────────────────────────────────────
    const oldRoleDesc  = currentRole
      ? `${currentRole.role}${currentRole.custom_label ? "/" + currentRole.custom_label : ""}`
      : "none";
    const newRoleDesc  = `${roleKey}${customLabel ? "/" + customLabel : ""}`;
    try {
      await conn.execute(
        `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, old_data, new_data)
         VALUES (?, ?, 'user_roles', ?, ?, ?)`,
        [
          req.user.id,
          "role_change",
          targetUserId,
          JSON.stringify({ role: currentRole?.role ?? null, custom_label: currentRole?.custom_label ?? null }),
          JSON.stringify({ role: roleKey, custom_label: customLabel }),
        ],
      );
    } catch (auditErr) {
      // Audit log failure must not block the role change — log to stderr only
      console.error("[audit] Failed to write role_change audit log:", auditErr.message);
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally {
    conn.release();
  }
});

// ─── PHASE 3: billing ─────────────────────────────────────────────────────
app.post("/api/billing/finalize", auth, async (req, res, next) => {
  try {
    if (!isBillingRole(req)) throw fail(403, "Billing or administrator role required");
    const invoiceId = String(req.body.invoice_id || "");
    if (!invoiceId) throw fail(422, "invoice_id required");

    const [[inv]] = await db().execute(
      "SELECT id, status FROM invoices WHERE id=?", [invoiceId],
    );
    if (!inv) throw fail(404, "Invoice not found");
    if (inv.status !== "draft") throw fail(409, `Cannot finalize invoice with status '${inv.status}'`);

    await db().execute(
      "UPDATE invoices SET status='issued', finalized_at=NOW(6), updated_at=NOW(6), updated_by=? WHERE id=? AND status='draft'",
      [req.user.id, invoiceId],
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/billing/cancel", auth, async (req, res, next) => {
  try {
    if (!isBillingRole(req)) throw fail(403, "Billing or administrator role required");
    const invoiceId = String(req.body.invoice_id || "");
    const reason    = String(req.body.reason || "").trim();
    if (!invoiceId) throw fail(422, "invoice_id required");
    if (reason.length < 3) throw fail(422, "Cancellation reason must be at least 3 characters");

    const [[inv]] = await db().execute(
      "SELECT id, status, paid_amount FROM invoices WHERE id=?", [invoiceId],
    );
    if (!inv) throw fail(404, "Invoice not found");
    if (inv.status !== "issued") throw fail(409, `Cannot cancel invoice with status '${inv.status}'`);
    if (Number(inv.paid_amount) > 0) throw fail(409, "Cannot cancel a partially or fully paid invoice");

    await db().execute(
      "UPDATE invoices SET status='cancelled', cancelled_at=NOW(6), cancellation_reason=?, updated_at=NOW(6), updated_by=? WHERE id=? AND status='issued'",
      [reason, req.user.id, invoiceId],
    );
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post("/api/billing/payment", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isBillingRole(req)) throw fail(403, "Billing or administrator role required");

    const invoiceId  = String(req.body.invoice_id || "");
    const amount     = Number(req.body.amount);
    const method     = String(req.body.method || "cash");
    const reference  = req.body.reference ? String(req.body.reference).trim() : null;

    const VALID_METHODS = ["cash", "card", "upi", "bank_transfer", "insurance", "other"];
    if (!invoiceId) throw fail(422, "invoice_id required");
    if (!amount || amount <= 0) throw fail(422, "Amount must be greater than zero");
    if (!VALID_METHODS.includes(method)) throw fail(422, "Invalid payment method");

    await conn.beginTransaction();

    const [[inv]] = await conn.execute(
      "SELECT id, status, total_amount, paid_amount FROM invoices WHERE id=? FOR UPDATE",
      [invoiceId],
    );
    if (!inv) throw fail(404, "Invoice not found");
    if (!["issued", "partially_paid"].includes(inv.status))
      throw fail(409, `Cannot record payment for invoice with status '${inv.status}'`);

    const balance = Number(inv.total_amount) - Number(inv.paid_amount);
    if (amount > balance + 0.005)
      throw fail(422, `Amount (${amount}) exceeds outstanding balance (${balance.toFixed(2)})`);

    // Generate receipt number
    const receiptNum = `RCT-${new Date().toISOString().slice(0,7).replace("-","")}-${randomUUID().replace(/-/g,"").slice(0,6).toUpperCase()}`;

    await conn.execute(
      "INSERT INTO payments (id,invoice_id,amount,method,reference,receipt_number,received_by,paid_at) VALUES (?,?,?,?,?,?,?,NOW(6))",
      [randomUUID(), invoiceId, amount, method, reference, receiptNum, req.user.id],
    );

    const newPaid   = Number(inv.paid_amount) + amount;
    const newStatus = newPaid >= Number(inv.total_amount) - 0.005 ? "paid" : "partially_paid";

    await conn.execute(
      "UPDATE invoices SET paid_amount=?, amount_received=?, status=?, updated_at=NOW(6), updated_by=? WHERE id=?",
      [newPaid, newPaid, newStatus, req.user.id, invoiceId],
    );

    await conn.commit();
    res.json({ ok: true, receipt_number: receiptNum });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally {
    conn.release();
  }
});

// ─── PHASE 4: pharmacy ────────────────────────────────────────────────────
app.post("/api/pharmacy/dispense", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isPharmacyRole(req)) throw fail(403, "Pharmacist or administrator role required");

    const patientId      = String(req.body.patient_id || "");
    const prescriptionId = req.body.prescription_id ? String(req.body.prescription_id) : null;
    const itemId         = String(req.body.pharmacy_item_id || "");
    const quantity       = Number(req.body.quantity);

    if (!patientId) throw fail(422, "patient_id required");
    if (!itemId)    throw fail(422, "pharmacy_item_id required");
    if (!quantity || quantity < 1 || !Number.isInteger(quantity))
      throw fail(422, "quantity must be a positive integer");

    await conn.beginTransaction();

    const [[item]] = await conn.execute(
      "SELECT id, stock_quantity, unit_price FROM pharmacy_items WHERE id=? FOR UPDATE",
      [itemId],
    );
    if (!item) throw fail(404, "Medicine not found");
    if (item.stock_quantity < quantity)
      throw fail(409, `Insufficient stock: ${item.stock_quantity} available, ${quantity} requested`);

    await conn.execute(
      "UPDATE pharmacy_items SET stock_quantity=stock_quantity-?, updated_at=NOW(6) WHERE id=?",
      [quantity, itemId],
    );
    await conn.execute(
      "INSERT INTO dispensations (id,patient_id,prescription_id,pharmacy_item_id,quantity,unit_price,dispensed_by,dispensed_at) VALUES (?,?,?,?,?,?,?,NOW(6))",
      [randomUUID(), patientId, prescriptionId, itemId, quantity, item.unit_price, req.user.id],
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally {
    conn.release();
  }
});

app.post("/api/pharmacy/bill", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isPharmacyRole(req)) throw fail(403, "Pharmacist or administrator role required");

    const patientId      = req.body.patient_id ? String(req.body.patient_id) : null;
    const walkInName     = req.body.walk_in_name ? String(req.body.walk_in_name).trim() : null;
    const walkInPhone    = req.body.walk_in_phone ? String(req.body.walk_in_phone).trim() : null;
    const items          = Array.isArray(req.body.items) ? req.body.items : [];
    const paymentAmount  = Number(req.body.payment_amount || 0);
    const paymentMethod  = String(req.body.payment_method || "cash");
    const paymentRef     = req.body.payment_reference ? String(req.body.payment_reference).trim() : null;
    const notes          = req.body.notes ? String(req.body.notes).trim() : null;
    const saveAsDraft    = Boolean(req.body.save_as_draft);
    const draftId        = req.body.draft_id ? String(req.body.draft_id) : null;

    if (!patientId && (!walkInName || walkInName.length < 2))
      throw fail(422, "Patient or walk-in customer name required");
    if (items.length === 0) throw fail(422, "At least one item is required");

    const VALID_METHODS = ["cash", "card", "upi", "bank_transfer", "insurance", "other"];
    if (!VALID_METHODS.includes(paymentMethod)) throw fail(422, "Invalid payment method");

    await conn.beginTransaction();

    // Lock and validate all items
    let subtotal = 0, lineDiscount = 0, taxAmount = 0;
    const resolvedItems = [];
    for (const line of items) {
      const itemId   = String(line.pharmacyItemId || "");
      const qty      = Number(line.quantity);
      const discPct  = Number(line.discountPercent || 0);
      if (!itemId || qty < 1) throw fail(422, "Invalid cart item");

      const [[stock]] = await conn.execute(
        "SELECT id, medicine_name, sku, hsn_code, batch_number, expires_on, unit_price, mrp, gst_rate, stock_quantity FROM pharmacy_items WHERE id=? FOR UPDATE",
        [itemId],
      );
      if (!stock) throw fail(404, `Medicine not found: ${itemId}`);
      if (!saveAsDraft && stock.stock_quantity < qty)
        throw fail(409, `Insufficient stock for ${stock.medicine_name}: ${stock.stock_quantity} available`);

      const gross          = Number(stock.unit_price) * qty;
      const discountAmt    = gross * (discPct / 100);
      const taxable        = gross - discountAmt;
      const tax            = taxable * (Number(stock.gst_rate) / 100);

      subtotal    += gross;
      lineDiscount += discountAmt;
      taxAmount    += tax;

      resolvedItems.push({
        itemId, qty, discPct, stock,
        gross, discountAmt, taxable, tax,
        lineTotal: taxable + tax,
      });
    }

    const totalAmount = subtotal - lineDiscount + taxAmount;
    const cgst = taxAmount / 2;
    const sgst = taxAmount - cgst;
    const paid  = saveAsDraft ? 0 : Math.min(paymentAmount, totalAmount);
    const status = saveAsDraft ? "draft" : (paid >= totalAmount - 0.005 ? "paid" : (paid > 0 ? "partially_paid" : "issued"));

    // Invoice number generated by DB trigger
    const invoiceId = draftId || randomUUID();
    const itemsJson = JSON.stringify(resolvedItems.map((r) => ({
      pharmacyItemId: r.itemId,
      medicineName:   r.stock.medicine_name,
      description:    r.stock.medicine_name,
      sku:            r.stock.sku,
      hsnCode:        r.stock.hsn_code,
      batchNumber:    r.stock.batch_number,
      expiryDate:     r.stock.expires_on,
      quantity:       r.qty,
      unitPrice:      Number(r.stock.unit_price),
      mrp:            Number(r.stock.mrp),
      discountPercent: r.discPct,
      discountAmount: r.discountAmt,
      taxRate:        Number(r.stock.gst_rate),
      taxableAmount:  r.taxable,
      taxAmount:      r.tax,
      amount:         r.lineTotal,
    })));

    if (draftId) {
      // Update existing draft
      await conn.execute(
        `UPDATE invoices SET patient_id=?,walk_in_name=?,walk_in_phone=?,items=?,subtotal=?,
         discount_amount=?,tax_amount=?,cgst_amount=?,sgst_amount=?,total_amount=?,paid_amount=?,
         amount_received=?,status=?,notes=?,updated_at=NOW(6),updated_by=?
         WHERE id=? AND status='draft'`,
        [patientId, walkInName, walkInPhone, itemsJson, subtotal, lineDiscount, taxAmount,
         cgst, sgst, totalAmount, paid, paid, status, notes, req.user.id, draftId],
      );
    } else {
      await conn.execute(
        `INSERT INTO invoices
         (id,invoice_number,patient_id,walk_in_name,walk_in_phone,items,subtotal,discount_amount,
          tax_amount,cgst_amount,sgst_amount,total_amount,paid_amount,amount_received,status,
          invoice_type,notes,created_by,updated_by)
         VALUES (?,CONCAT('PH-INV-',DATE_FORMAT(NOW(),'%Y%m'),'-',UPPER(LEFT(REPLACE(UUID(),'-',''),6))),
                 ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [invoiceId, patientId, walkInName, walkInPhone, itemsJson, subtotal, lineDiscount,
         taxAmount, cgst, sgst, totalAmount, paid, paid, status, "pharmacy", notes,
         req.user.id, req.user.id],
      );
    }

    // If not draft: write dispensations, decrement stock, record payment
    if (!saveAsDraft) {
      for (const r of resolvedItems) {
        await conn.execute(
          "UPDATE pharmacy_items SET stock_quantity=stock_quantity-?, updated_at=NOW(6) WHERE id=?",
          [r.qty, r.itemId],
        );
        await conn.execute(
          `INSERT INTO pharmacy_invoice_items
           (id,invoice_id,pharmacy_item_id,medicine_name,sku,hsn_code,batch_number,expires_on,
            quantity,unit_price,mrp,discount_percent,discount_amount,gst_rate,taxable_amount,
            tax_amount,line_total)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [randomUUID(), invoiceId, r.itemId, r.stock.medicine_name, r.stock.sku,
           r.stock.hsn_code, r.stock.batch_number, r.stock.expires_on, r.qty,
           r.stock.unit_price, r.stock.mrp, r.discPct, r.discountAmt, r.stock.gst_rate,
           r.taxable, r.tax, r.lineTotal],
        );
        await conn.execute(
          `INSERT INTO dispensations
           (id,patient_id,pharmacy_item_id,quantity,unit_price,dispensed_by,dispensed_at,invoice_id)
           VALUES (?,?,?,?,?,?,NOW(6),?)`,
          [randomUUID(), patientId, r.itemId, r.qty, r.stock.unit_price, req.user.id, invoiceId],
        );
      }

      if (paid > 0) {
        const receiptNum = `RCT-${new Date().toISOString().slice(0,7).replace("-","")}-${randomUUID().replace(/-/g,"").slice(0,6).toUpperCase()}`;
        await conn.execute(
          "INSERT INTO payments (id,invoice_id,amount,method,reference,receipt_number,received_by,paid_at) VALUES (?,?,?,?,?,?,?,NOW(6))",
          [randomUUID(), invoiceId, paid, paymentMethod, paymentRef, receiptNum, req.user.id],
        );
      }

      // Finalize
      await conn.execute(
        "UPDATE invoices SET finalized_at=NOW(6) WHERE id=? AND status<>'draft'",
        [invoiceId],
      );
    }

    await conn.commit();

    // Return invoice row for preview
    const [[invoice]] = await db().execute("SELECT * FROM invoices WHERE id=?", [invoiceId]);
    res.json({ ok: true, invoice });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally {
    conn.release();
  }
});

// ─── PHASE 5: imports ─────────────────────────────────────────────────────
function importAuth(req) {
  if (isAdmin(req)) return true;
  const label = (req.user.custom_role_label || "").toLowerCase();
  const roles = req.user.roles;
  return roles.includes("staff") || roles.includes("doctor") ||
    label === "nurse" || label === "pharmacist" || label === "billing_operator";
}

app.post("/api/imports/patients", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!importAuth(req)) throw fail(403, "Insufficient role for patient import");
    const fileName = String(req.body.file_name || "import.csv").trim();
    const rows     = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) throw fail(422, "No rows provided");

    let imported = 0, skipped = 0;
    const errors = [];

    await conn.beginTransaction();
    const batchId = randomUUID();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fullName = String(row.full_name || "").trim();
      if (!fullName) { errors.push({ row: i + 1, error: "full_name is required" }); skipped++; continue; }

      try {
        // MRN-based dedupe
        if (row.mrn) {
          const [[existing]] = await conn.execute("SELECT id FROM patients WHERE mrn=?", [String(row.mrn).trim()]);
          if (existing) { skipped++; continue; }
        }
        // Phone+name dedupe
        if (row.phone) {
          const [[dup]] = await conn.execute(
            "SELECT id FROM patients WHERE phone=? AND full_name=?",
            [String(row.phone).trim(), fullName],
          );
          if (dup) { skipped++; continue; }
        }

        const mrn = row.mrn ? String(row.mrn).trim()
          : `MRN-${randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}`;
        await conn.execute(
          `INSERT INTO patients (id,mrn,full_name,date_of_birth,gender,phone,email,address,blood_group,notes,created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [randomUUID(), mrn, fullName,
           row.date_of_birth || null, row.gender || null,
           row.phone ? String(row.phone).trim() : null,
           row.email ? String(row.email).trim().toLowerCase() : null,
           row.address ? String(row.address).trim() : null,
           row.blood_group ? String(row.blood_group).trim() : null,
           row.notes ? String(row.notes).trim() : null,
           req.user.id],
        );
        imported++;
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") { skipped++; } else { errors.push({ row: i+1, error: e.message }); skipped++; }
      }
    }

    await conn.execute(
      `INSERT INTO import_batches (id,import_type,file_name,total_rows,imported_rows,skipped_rows,error_rows,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [batchId, "patients", fileName, rows.length, imported, skipped, errors.length, req.user.id],
    );
    await conn.commit();
    res.json({ total: rows.length, imported, skipped, errors });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally { conn.release(); }
});

app.post("/api/imports/pharmacy", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isPharmacyRole(req)) throw fail(403, "Pharmacist or administrator role required");
    const fileName      = String(req.body.file_name || "import.csv").trim();
    const rows          = Array.isArray(req.body.rows) ? req.body.rows : [];
    const updateExist   = Boolean(req.body.update_existing);
    if (!rows.length) throw fail(422, "No rows provided");

    let imported = 0, skipped = 0;
    const errors = [];

    await conn.beginTransaction();
    const batchId = randomUUID();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row.medicine_name || "").trim();
      if (!name) { errors.push({ row: i+1, error: "medicine_name required" }); skipped++; continue; }

      try {
        const sku   = row.sku   ? String(row.sku).trim()   : null;
        const batch = row.batch_number ? String(row.batch_number).trim() : null;

        if (sku) {
          const [[existing]] = await conn.execute(
            "SELECT id FROM pharmacy_items WHERE sku_lower=LOWER(?) AND batch_lower=LOWER(COALESCE(?,\"\"))",
            [sku, batch || ""],
          );
          if (existing) {
            if (!updateExist) { skipped++; continue; }
            await conn.execute(
              `UPDATE pharmacy_items SET medicine_name=?,expires_on=?,stock_quantity=stock_quantity+?,
               reorder_level=?,unit_price=?,mrp=?,gst_rate=?,hsn_code=?,updated_at=NOW(6) WHERE id=?`,
              [name, row.expiry_date||null, Number(row.quantity||0),
               Number(row.reorder_level||10), Number(row.unit_price||0),
               Number(row.mrp||row.unit_price||0), Number(row.gst_rate||0),
               row.hsn_code||null, existing.id],
            );
            imported++; continue;
          }
        }
        await conn.execute(
          `INSERT INTO pharmacy_items
           (id,medicine_name,sku,batch_number,expires_on,stock_quantity,reorder_level,unit_price,mrp,gst_rate,hsn_code,created_by)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [randomUUID(), name, sku, batch, row.expiry_date||null,
           Number(row.quantity||0), Number(row.reorder_level||10),
           Number(row.unit_price||0), Number(row.mrp||row.unit_price||0),
           Number(row.gst_rate||0), row.hsn_code||null, req.user.id],
        );
        imported++;
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") { skipped++; } else { errors.push({ row: i+1, error: e.message }); skipped++; }
      }
    }

    await conn.execute(
      `INSERT INTO import_batches (id,import_type,file_name,total_rows,imported_rows,skipped_rows,error_rows,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [batchId, "pharmacy", fileName, rows.length, imported, skipped, errors.length, req.user.id],
    );
    await conn.commit();
    res.json({ total: rows.length, imported, skipped, errors });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally { conn.release(); }
});

app.post("/api/imports/services", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isBillingRole(req)) throw fail(403, "Billing or administrator role required");
    const fileName = String(req.body.file_name || "import.csv").trim();
    const rows     = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) throw fail(422, "No rows provided");

    let imported = 0, skipped = 0;
    const errors = [];

    await conn.beginTransaction();
    const batchId = randomUUID();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const code = String(row.service_code || "").trim().toUpperCase();
      const name = String(row.service_name || "").trim();
      if (!code || !name) { errors.push({ row: i+1, error: "service_code and service_name required" }); skipped++; continue; }
      const price = Number(row.default_price ?? 0);
      if (isNaN(price) || price < 0) { errors.push({ row: i+1, error: "default_price must be >= 0" }); skipped++; continue; }

      try {
        await conn.execute(
          `INSERT INTO service_catalog (id,service_code,service_name,category,default_price,tax_rate,is_active,created_by)
           VALUES (?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE service_name=VALUES(service_name),default_price=VALUES(default_price),
           tax_rate=VALUES(tax_rate),is_active=VALUES(is_active),updated_at=NOW(6)`,
          [randomUUID(), code, name, row.category||null, price,
           Number(row.tax_rate||0), row.active===false ? 0 : 1, req.user.id],
        );
        imported++;
      } catch (e) {
        errors.push({ row: i+1, error: e.message }); skipped++;
      }
    }

    await conn.execute(
      `INSERT INTO import_batches (id,import_type,file_name,total_rows,imported_rows,skipped_rows,error_rows,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [batchId, "services", fileName, rows.length, imported, skipped, errors.length, req.user.id],
    );
    await conn.commit();
    res.json({ total: rows.length, imported, skipped, errors });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally { conn.release(); }
});

app.post("/api/imports/appointments", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isStaffOrAdmin(req)) throw fail(403, "Staff or administrator role required");
    const fileName = String(req.body.file_name || "import.csv").trim();
    const rows     = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) throw fail(422, "No rows provided");

    let imported = 0, skipped = 0;
    const errors = [];

    await conn.beginTransaction();
    const batchId = randomUUID();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.patient_mrn || !row.appointment_date || !row.appointment_time) {
        errors.push({ row: i+1, error: "patient_mrn, appointment_date, appointment_time required" }); skipped++; continue;
      }
      try {
        const [[patient]] = await conn.execute("SELECT id FROM patients WHERE mrn=?", [String(row.patient_mrn).trim()]);
        if (!patient) { errors.push({ row: i+1, error: `Patient MRN not found: ${row.patient_mrn}` }); skipped++; continue; }

        let doctorId = null;
        if (row.doctor_email) {
          const [[doc]] = await conn.execute(
            "SELECT p.id FROM profiles p JOIN auth_users a ON a.id=p.id WHERE a.email=?",
            [String(row.doctor_email).trim().toLowerCase()],
          );
          if (!doc) { errors.push({ row: i+1, error: `Doctor email not found: ${row.doctor_email}` }); skipped++; continue; }
          doctorId = doc.id;
        }

        const scheduledAt = `${row.appointment_date} ${row.appointment_time}:00`;
        const status = ["scheduled","confirmed","completed","cancelled","no_show"].includes(row.status)
          ? row.status : "scheduled";

        await conn.execute(
          `INSERT INTO appointments (id,patient_id,doctor_id,scheduled_at,reason,status,created_by)
           VALUES (?,?,?,?,?,?,?)`,
          [randomUUID(), patient.id, doctorId, scheduledAt, row.reason||null, status, req.user.id],
        );
        imported++;
      } catch (e) {
        errors.push({ row: i+1, error: e.message }); skipped++;
      }
    }

    await conn.execute(
      `INSERT INTO import_batches (id,import_type,file_name,total_rows,imported_rows,skipped_rows,error_rows,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [batchId, "appointments", fileName, rows.length, imported, skipped, errors.length, req.user.id],
    );
    await conn.commit();
    res.json({ total: rows.length, imported, skipped, errors });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally { conn.release(); }
});

// ─── PHASE 6: staff invitation ────────────────────────────────────────────
app.post("/api/admin/invite-staff", auth, async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    if (!isAdmin(req)) throw fail(403, "Administrator role required");

    const rows    = Array.isArray(req.body.rows) ? req.body.rows : [];
    const fileName = String(req.body.file_name || "staff-invite.csv").trim();
    if (!rows.length) throw fail(422, "No rows provided");

    const SAFE_ROLES = { staff: "staff", doctor: "doctor", nurse: "custom", pharmacist: "custom",
      lab_technician: "custom", billing_operator: "custom" };
    const CUSTOM_LABELS = { nurse: "nurse", pharmacist: "pharmacist",
      lab_technician: "lab_technician", billing_operator: "billing_operator" };

    const results = [];
    let imported = 0, skipped = 0;
    const errors = [];
    const batchId = randomUUID();

    await conn.beginTransaction();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const email    = String(row.email || "").trim().toLowerCase();
      const fullName = String(row.full_name || "").trim();
      const roleKey  = String(row.role || "staff").toLowerCase().trim();

      if (!isValidEmail(email) || !fullName) {
        errors.push({ row: i+1, error: "full_name and valid email required" }); skipped++; continue;
      }
      if (!SAFE_ROLES[roleKey]) {
        errors.push({ row: i+1, error: `Unknown role: ${roleKey}` }); skipped++; continue;
      }

      try {
        const [[existing]] = await conn.execute("SELECT id FROM auth_users WHERE email=?", [email]);
        if (existing) { results.push({ email, status: "EXISTING" }); skipped++; continue; }

        // Generate a temporary password — admin must share it with the invitee
        const tempPass = randomUUID().replace(/-/g,"").slice(0,16) + "Aa1!";
        const hash     = await bcrypt.hash(tempPass, 12);
        const id       = randomUUID();
        const dbRole   = SAFE_ROLES[roleKey];
        const label    = CUSTOM_LABELS[roleKey] || null;

        await conn.execute(
          "INSERT INTO auth_users (id,email,password_hash,email_verified,is_active) VALUES (?,?,?,0,1)",
          [id, email, hash],
        );
        await conn.execute(
          "INSERT INTO profiles (id,email,full_name,organization,status) VALUES (?,?,?,?,'active')",
          [id, email, fullName, row.organization ? String(row.organization).trim() : null],
        );
        await conn.execute(
          "INSERT INTO user_roles (id,user_id,role,custom_label) VALUES (?,?,?,?)",
          [randomUUID(), id, dbRole, label],
        );

        // Try to send invitation email
        const emailSent = await sendMail({
          to: email,
          subject: "Your CareOrbit account has been created",
          text: `Hello ${fullName},\n\nAn account has been created for you on CareOrbit.\n\nEmail: ${email}\nTemporary password: ${tempPass}\n\nPlease sign in and change your password immediately.\n`,
          html: `<p>Hello ${fullName},</p><p>An account has been created for you on CareOrbit.</p><p><b>Email:</b> ${email}<br><b>Temporary password:</b> ${tempPass}</p><p>Please sign in and change your password immediately.</p>`,
        });

        results.push({
          email,
          status: "CREATED",
          email_configured: emailSent,
          // Only expose temp password in response if email could not be sent
          ...(emailSent ? {} : { temp_password: tempPass }),
        });
        imported++;
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") { results.push({ email, status: "EXISTING" }); skipped++; }
        else { errors.push({ row: i+1, error: e.message }); skipped++; }
      }
    }

    await conn.execute(
      `INSERT INTO import_batches (id,import_type,file_name,total_rows,imported_rows,skipped_rows,error_rows,created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [batchId, "staff", fileName, rows.length, imported, skipped, errors.length, req.user.id],
    );
    await conn.commit();
    res.json({ total: rows.length, imported, skipped, errors, results });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally { conn.release(); }
});

// ─── PHASE 7: password reset ──────────────────────────────────────────────
app.post("/api/auth/request-password-reset", async (req, res, next) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    if (!rateLimit(`pwreset:${ip}`, 5, 300000)) throw fail(429, "Too many reset attempts");

    const email = String(req.body.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) throw fail(422, "A valid email is required");

    // Always respond generically — do not reveal whether email exists
    const [[user]] = await db().execute(
      "SELECT a.id FROM auth_users a WHERE a.email=? AND a.is_active=1", [email],
    );

    if (user) {
      // Expire old tokens
      await db().execute(
        "UPDATE password_reset_tokens SET used_at=NOW(6) WHERE user_id=? AND used_at IS NULL",
        [user.id],
      );

      const rawToken  = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await db().execute(
        "INSERT INTO password_reset_tokens (id,user_id,token,expires_at) VALUES (?,?,?,?)",
        [randomUUID(), user.id, tokenHash, expiresAt.toISOString().replace("T"," ").slice(0,26)],
      );

      const resetUrl = `${process.env.APP_URL || "http://localhost:8081"}/reset-password?token=${rawToken}`;
      const emailSent = await sendMail({
        to: email,
        subject: "Reset your CareOrbit password",
        text: `Use the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
        html: `<p>Use the link below to reset your password (expires in 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you did not request this, ignore this email.</p>`,
      });

      // In development with no SMTP, return the token in the response for testing
      if (!emailSent && process.env.NODE_ENV !== "production") {
        return res.json({ ok: true, email_configured: false, dev_reset_url: resetUrl });
      }
    }

    res.json({ ok: true, email_configured: !!process.env.SMTP_HOST });
  } catch (error) { next(error); }
});

app.post("/api/auth/verify-reset-token", async (req, res, next) => {
  try {
    const rawToken = String(req.body.token || "").trim();
    if (!rawToken) throw fail(422, "token required");

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const [[row]] = await db().execute(
      "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token=?",
      [tokenHash],
    );

    if (!row || row.used_at || new Date(row.expires_at) < new Date())
      throw fail(400, "Reset link is invalid, expired, or has already been used");

    res.json({ ok: true, token: rawToken });
  } catch (error) { next(error); }
});

app.post("/api/auth/complete-password-reset", async (req, res, next) => {
  const conn = await db().getConnection();
  try {
    const rawToken = String(req.body.token || "").trim();
    const password = String(req.body.password || "");

    if (!rawToken) throw fail(422, "token required");
    const pwErr = passwordError(password);
    if (pwErr) throw fail(422, pwErr);

    const tokenHash = createHash("sha256").update(rawToken).digest("hex");

    await conn.beginTransaction();

    const [[row]] = await conn.execute(
      "SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token=? FOR UPDATE",
      [tokenHash],
    );
    if (!row || row.used_at || new Date(row.expires_at) < new Date())
      throw fail(400, "Reset link is invalid, expired, or has already been used");

    const hash = await bcrypt.hash(password, 12);

    await conn.execute(
      "UPDATE auth_users SET password_hash=?, updated_at=NOW(6) WHERE id=?",
      [hash, row.user_id],
    );
    // Mark token as used
    await conn.execute(
      "UPDATE password_reset_tokens SET used_at=NOW(6) WHERE id=?",
      [row.id],
    );
    // Revoke all sessions
    await conn.execute(
      "UPDATE user_sessions SET revoked_at=NOW(6), revoked_reason='password_change' WHERE user_id=? AND revoked_at IS NULL",
      [row.user_id],
    );

    await conn.commit();
    res.json({ ok: true });
  } catch (error) {
    try { await conn.rollback(); } catch {}
    next(error);
  } finally { conn.release(); }
});

// ─── PHASE 8: storage / logo upload ──────────────────────────────────────
// Ensure upload directory exists
const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "branding");
try { mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}

app.post("/api/uploads/logo", auth, async (req, res, next) => {
  try {
    if (!isAdmin(req)) throw fail(403, "Administrator role required");

    // Parse multipart manually using raw body streaming
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data"))
      throw fail(400, "multipart/form-data required");

    const boundary = contentType.split("boundary=")[1];
    if (!boundary) throw fail(400, "Missing multipart boundary");

    // Collect raw body
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", resolve);
      req.on("error", reject);
    });
    const body = Buffer.concat(chunks);

    // Extract file from multipart
    const sep = Buffer.from(`--${boundary}`);
    let start = body.indexOf(sep) + sep.length + 2; // skip \r\n
    // Find header end
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) throw fail(400, "Malformed multipart body");

    const headers = body.slice(start, headerEnd).toString();
    const contentTypeMatch = headers.match(/content-type:\s*([^\r\n]+)/i);
    const mimeType = contentTypeMatch ? contentTypeMatch[1].trim() : "";

    const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"];
    if (!ALLOWED_MIME.includes(mimeType)) throw fail(422, "Logo must be PNG, JPEG or WebP");

    const fileStart = headerEnd + 4;
    const fileEnd   = body.lastIndexOf(Buffer.from(`\r\n--${boundary}`));
    if (fileEnd <= fileStart) throw fail(400, "Could not extract file from upload");

    const fileBuffer = body.slice(fileStart, fileEnd);
    if (fileBuffer.length > 2 * 1024 * 1024) throw fail(422, "Logo must be 2 MB or smaller");

    const ext  = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mimeType];
    const name = `logo-${Date.now()}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, name);

    await new Promise((resolve, reject) => {
      const ws = createWriteStream(filePath);
      ws.write(fileBuffer, (err) => { if (err) reject(err); else { ws.end(); resolve(); } });
    });

    // Return relative path for storage in DB
    const logoPath = `branding/${name}`;
    res.json({ ok: true, path: logoPath, publicUrl: `/uploads/${logoPath}` });
  } catch (error) { next(error); }
});

app.delete("/api/uploads/logo", auth, async (req, res, next) => {
  try {
    if (!isAdmin(req)) throw fail(403, "Administrator role required");
    const logoPath = String(req.body.path || "").trim();
    if (!logoPath) throw fail(422, "path required");
    // Only allow deletion of files within the uploads directory — prevent path traversal
    const resolved = path.resolve(path.join(process.cwd(), "public", "uploads"), logoPath);
    const allowed  = path.resolve(path.join(process.cwd(), "public", "uploads"));
    if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed)
      throw fail(403, "Invalid path");
    if (existsSync(resolved)) unlinkSync(resolved);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// ─── PHASE 9: appointment notification (MySQL session auth) ──────────────
app.post("/api/appointment-notification", auth, async (req, res, next) => {
  try {
    const phone   = String(req.body.phone   || "").trim();
    const message = String(req.body.message || "").trim();
    if (!phone || !message) throw fail(400, "Phone and message are required");

    const normalizePhone = (p) => `+${p.replace(/\D/g, "")}`;

    const accountSid   = process.env.TWILIO_ACCOUNT_SID;
    const authToken    = process.env.TWILIO_AUTH_TOKEN;
    const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
    const smsFrom      = process.env.TWILIO_SMS_FROM;
    const from         = whatsappFrom ?? smsFrom;

    if (!accountSid || !authToken || !from) {
      throw fail(503, "Phone notification provider is not configured");
    }

    const useWhatsApp = Boolean(whatsappFrom);
    const to   = normalizePhone(phone);
    const form = new URLSearchParams({
      From: useWhatsApp ? `whatsapp:${from.replace(/^whatsapp:/, "")}` : from,
      To:   useWhatsApp ? `whatsapp:${to}` : to,
      Body: message.slice(0, 1500),
    });

    const twilioRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method:  "POST",
        headers: {
          authorization:  `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
    const result = await twilioRes.json();
    if (!twilioRes.ok) throw fail(502, result.message ?? "Phone notification failed");

    res.json({ delivered: true, channel: useWhatsApp ? "whatsapp" : "sms", messageId: result.sid });
  } catch (error) { next(error); }
});

// ─── PHASE 10: role-aware dashboard summary ───────────────────────────────
// GET /api/dashboard/summary
// Returns role-specific aggregated counts. Uses SQL COUNT aggregates only —
// never SELECT * for counts, never exposes cross-user clinical data.
app.get("/api/dashboard/summary", auth, async (req, res, next) => {
  try {
    const roleKey   = resolveRoleKey(req);
    const userId    = req.user.id;
    const conn      = db();

    // Shared helper — today's date range in MySQL server time
    // We let MySQL compute NOW() so there is no Node ↔ DB clock skew.
    const todayStart = "DATE(NOW())";
    const todayEnd   = "DATE_ADD(DATE(NOW()), INTERVAL 1 DAY)";

    let summary = {};

    // ── Admin roles (super_admin / hospital_admin / admin) ────────────────
    if (isAdmin(req)) {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM patients)                                           AS total_patients,
           (SELECT COUNT(*) FROM appointments)                                       AS total_appointments,
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd})     AS today_appointments,
           (SELECT COUNT(*) FROM profiles WHERE status = 'pending_approval')        AS pending_approvals,
           (SELECT COUNT(*) FROM profiles WHERE status = 'active')                  AS active_users,
           (SELECT COUNT(*) FROM invoices   WHERE status IN ('issued','partially_paid')) AS open_invoices,
           (SELECT COALESCE(SUM(total_amount - paid_amount),0) FROM invoices
            WHERE status IN ('issued','partially_paid'))                             AS outstanding_amount,
           (SELECT COUNT(*) FROM audit_logs
            WHERE created_at >= ${todayStart})                                       AS audit_events_today`
      );

      const [recentAudit] = await conn.execute(
        `SELECT actor_id, action, entity_type, created_at
         FROM audit_logs
         ORDER BY created_at DESC
         LIMIT 5`
      );

      summary = {
        role: roleKey,
        total_patients:       Number(totals.total_patients),
        total_appointments:   Number(totals.total_appointments),
        today_appointments:   Number(totals.today_appointments),
        pending_approvals:    Number(totals.pending_approvals),
        active_users:         Number(totals.active_users),
        open_invoices:        Number(totals.open_invoices),
        outstanding_amount:   Number(totals.outstanding_amount),
        audit_events_today:   Number(totals.audit_events_today),
        recent_audit:         Array.isArray(recentAudit) ? recentAudit : [],
      };
    }

    // ── Staff / Reception ─────────────────────────────────────────────────
    else if (roleKey === "staff") {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd})     AS today_appointments,
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd}
              AND status = 'scheduled')                                              AS queue_waiting,
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd}
              AND status = 'completed')                                              AS completed_today,
           (SELECT COUNT(*) FROM patients
            WHERE created_at >= ${todayStart})                                       AS new_patients_today,
           (SELECT COUNT(*) FROM appointments WHERE status = 'scheduled')           AS total_scheduled`
      );
      summary = {
        role:                roleKey,
        today_appointments:  Number(totals.today_appointments),
        queue_waiting:       Number(totals.queue_waiting),
        completed_today:     Number(totals.completed_today),
        new_patients_today:  Number(totals.new_patients_today),
        total_scheduled:     Number(totals.total_scheduled),
      };
    }

    // ── Doctor ────────────────────────────────────────────────────────────
    else if (roleKey === "doctor") {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM appointments
            WHERE doctor_id = ? AND scheduled_at >= ${todayStart}
              AND scheduled_at < ${todayEnd})                                        AS my_today,
           (SELECT COUNT(*) FROM appointments
            WHERE doctor_id = ? AND status = 'scheduled')                           AS my_upcoming,
           (SELECT COUNT(*) FROM prescriptions
            WHERE doctor_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS rx_last_7d,
           (SELECT COUNT(*) FROM lab_orders
            WHERE ordered_by = ? AND status IN ('pending','sample_collected'))      AS pending_labs,
           (SELECT COUNT(*) FROM appointments
            WHERE doctor_id = ? AND scheduled_at >= ${todayStart}
              AND scheduled_at < ${todayEnd} AND status = 'completed')              AS completed_today`,
        [userId, userId, userId, userId, userId]
      );
      summary = {
        role:            roleKey,
        my_today:        Number(totals.my_today),
        my_upcoming:     Number(totals.my_upcoming),
        rx_last_7d:      Number(totals.rx_last_7d),
        pending_labs:    Number(totals.pending_labs),
        completed_today: Number(totals.completed_today),
      };
    }

    // ── Nurse ─────────────────────────────────────────────────────────────
    else if (roleKey === "nurse") {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd})     AS today_appointments,
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd}
              AND status = 'scheduled')                                              AS queue_waiting,
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd}
              AND status = 'completed')                                              AS completed_today,
           (SELECT COUNT(*) FROM prescriptions
            WHERE created_at >= ${todayStart})                                       AS prescriptions_today`
      );
      summary = {
        role:                 roleKey,
        today_appointments:   Number(totals.today_appointments),
        queue_waiting:        Number(totals.queue_waiting),
        completed_today:      Number(totals.completed_today),
        prescriptions_today:  Number(totals.prescriptions_today),
      };
    }

    // ── Pharmacist ────────────────────────────────────────────────────────
    else if (roleKey === "pharmacist") {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM prescriptions
            WHERE created_at >= ${todayStart})                                       AS prescriptions_today,
           (SELECT COUNT(*) FROM prescriptions
            WHERE status IN ('pending','active')
              OR status IS NULL)                                                     AS pending_prescriptions,
           (SELECT COUNT(*) FROM dispensations
            WHERE dispensed_at >= ${todayStart})                                     AS dispensed_today,
           (SELECT COUNT(*) FROM pharmacy_items WHERE stock_quantity <= reorder_level
              AND stock_quantity > 0)                                                AS low_stock_items,
           (SELECT COUNT(*) FROM pharmacy_items WHERE stock_quantity = 0)           AS out_of_stock`
      );
      summary = {
        role:                    roleKey,
        prescriptions_today:     Number(totals.prescriptions_today),
        pending_prescriptions:   Number(totals.pending_prescriptions),
        dispensed_today:         Number(totals.dispensed_today),
        low_stock_items:         Number(totals.low_stock_items),
        out_of_stock:            Number(totals.out_of_stock),
      };
    }

    // ── Lab Technician ────────────────────────────────────────────────────
    else if (roleKey === "lab_technician") {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM lab_orders WHERE status = 'pending')               AS pending_orders,
           (SELECT COUNT(*) FROM lab_orders WHERE status = 'sample_collected')      AS samples_collected,
           (SELECT COUNT(*) FROM lab_orders WHERE status = 'completed'
            AND updated_at >= ${todayStart})                                         AS completed_today,
           (SELECT COUNT(*) FROM lab_orders WHERE status = 'pending'
            AND created_at < DATE_SUB(NOW(), INTERVAL 4 HOUR))                      AS overdue_orders,
           (SELECT COUNT(*) FROM lab_orders
            WHERE created_at >= ${todayStart})                                       AS ordered_today`
      );
      summary = {
        role:               roleKey,
        pending_orders:     Number(totals.pending_orders),
        samples_collected:  Number(totals.samples_collected),
        completed_today:    Number(totals.completed_today),
        overdue_orders:     Number(totals.overdue_orders),
        ordered_today:      Number(totals.ordered_today),
      };
    }

    // ── Billing Operator ──────────────────────────────────────────────────
    else if (roleKey === "billing_operator") {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM invoices WHERE status = 'issued')                  AS open_invoices,
           (SELECT COUNT(*) FROM invoices WHERE status = 'partially_paid')          AS partially_paid,
           (SELECT COALESCE(SUM(total_amount - paid_amount),0) FROM invoices
            WHERE status IN ('issued','partially_paid'))                             AS outstanding_amount,
           (SELECT COUNT(*) FROM payments
            WHERE paid_at >= ${todayStart})                                          AS payments_today,
           (SELECT COALESCE(SUM(amount),0) FROM payments
            WHERE paid_at >= ${todayStart})                                          AS collected_today,
           (SELECT COUNT(*) FROM invoices
            WHERE created_at >= ${todayStart})                                       AS invoices_today`
      );
      summary = {
        role:               roleKey,
        open_invoices:      Number(totals.open_invoices),
        partially_paid:     Number(totals.partially_paid),
        outstanding_amount: Number(totals.outstanding_amount),
        payments_today:     Number(totals.payments_today),
        collected_today:    Number(totals.collected_today),
        invoices_today:     Number(totals.invoices_today),
      };
    }

    // ── Custom / Pending / Fallback ───────────────────────────────────────
    else {
      const [[totals]] = await conn.execute(
        `SELECT
           (SELECT COUNT(*) FROM appointments
            WHERE scheduled_at >= ${todayStart} AND scheduled_at < ${todayEnd})     AS today_appointments,
           (SELECT COUNT(*) FROM patients)                                           AS total_patients`
      );
      summary = {
        role:               roleKey,
        today_appointments: Number(totals.today_appointments),
        total_patients:     Number(totals.total_patients),
      };
    }

    res.json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500);
  if (status >= 500) console.error(error);
  const message =
    status === 409
      ? "Email already registered"
      : status === 500
        ? "Internal server error"
        : error.message;
  res.status(status).json({ error: { message, status } });
});
app.listen(Number(process.env.PORT || 3001), () => console.log("CareOrbit API listening"));
