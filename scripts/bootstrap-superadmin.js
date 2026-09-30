/**
 * CareOrbit — First-run Super Admin bootstrap
 *
 * Creates the first production Super Admin account interactively.
 * This is a CLI-only tool. It has NO HTTP endpoint, no public interface,
 * and no unauthenticated path. Run it once from the server/deployment
 * environment where the MYSQL_* environment variables are set.
 *
 * Usage:
 *   npm run bootstrap:superadmin
 *   node scripts/bootstrap-superadmin.js
 *
 * The script refuses to create a second Super Admin if one already exists.
 */

import "dotenv/config";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";

// ── Terminal helpers ──────────────────────────────────────────────────────

function writeLine(message) {
  process.stdout.write(message + "\n");
}

function die(message) {
  process.stderr.write("\n[ERROR] " + message + "\n\n");
  process.exit(1);
}

/** Prompt the user for a single line of input. */
function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer));
  });
}

/**
 * Prompt for a password without echoing characters.
 * Falls back to a visible prompt if the terminal is not a TTY
 * (e.g. piped input during testing — but warn loudly).
 */
function promptPassword(rl, question) {
  return new Promise((resolve) => {
    if (process.stdout.isTTY) {
      // Switch to raw mode to hide keystrokes
      process.stdout.write(question);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      let chars = "";
      const onData = (ch) => {
        if (ch === "\r" || ch === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(chars);
        } else if (ch === "\u0003") {
          // Ctrl-C
          process.stdin.setRawMode(false);
          process.stdin.pause();
          writeLine("\nInterrupted.");
          process.exit(0);
        } else if (ch === "\u007F" || ch === "\b") {
          // Backspace
          if (chars.length > 0) chars = chars.slice(0, -1);
        } else {
          chars += ch;
        }
      };
      process.stdin.on("data", onData);
    } else {
      // Non-TTY (e.g. piped): warn, then use readline (visible)
      process.stderr.write(
        "[WARN] Non-interactive terminal detected. Password will be visible.\n",
      );
      rl.question(question, (answer) => resolve(answer));
    }
  });
}

// ── Password validation (mirrors server.js passwordError) ────────────────

function passwordError(v) {
  if (v.length < 10) return "Password must be at least 10 characters";
  if (!/[A-Z]/.test(v)) return "Password must include an uppercase letter";
  if (!/[a-z]/.test(v)) return "Password must include a lowercase letter";
  if (!/\d/.test(v)) return "Password must include a number";
  if (!/[^A-Za-z0-9]/.test(v)) return "Password must include a special character";
  return null;
}

// ── Email validation (mirrors server.js isValidEmail) ────────────────────

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

// ── Database connection ───────────────────────────────────────────────────

const required = ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"];
const missing  = required.filter((k) => !process.env[k]);
if (missing.length) {
  die(
    `MySQL is not configured. Missing environment variables: ${missing.join(", ")}\n` +
    "  Load your .env file or set these variables before running this command.",
  );
}

let db;
try {
  db = await mysql.createConnection({
    host:     process.env.MYSQL_HOST,
    port:     Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE,
    user:     process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    charset:  "utf8mb4",
  });
} catch (err) {
  die("Could not connect to MySQL: " + err.message);
}

// ── Guard: refuse if a Super Admin already exists ─────────────────────────

const [[{ existing }]] = await db.execute(
  "SELECT COUNT(*) AS existing FROM user_roles WHERE role = 'admin' AND custom_label = 'super_admin'",
);

if (Number(existing) > 0) {
  await db.end();
  writeLine("");
  writeLine("╔════════════════════════════════════════════════════════════╗");
  writeLine("║         A Super Admin already exists in this database.     ║");
  writeLine("║         No changes have been made.                         ║");
  writeLine("╚════════════════════════════════════════════════════════════╝");
  writeLine("");
  writeLine("To manage roles, log in as Super Admin and visit /access-control.");
  writeLine("");
  process.exit(0);
}

// ── Interactive prompts ───────────────────────────────────────────────────

writeLine("");
writeLine("╔════════════════════════════════════════════════════════════╗");
writeLine("║          CareOrbit — First Super Admin Bootstrap           ║");
writeLine("╚════════════════════════════════════════════════════════════╝");
writeLine("");
writeLine("No Super Admin exists yet. This wizard creates the first one.");
writeLine("This command is idempotent: running it again will safely abort.");
writeLine("");

const rl = createInterface({
  input:  process.stdin,
  output: process.stdout,
  terminal: false, // prevent rl from echoing — we manage output ourselves
});

// Email
let email;
while (true) {
  const raw = (await prompt(rl, "  Email address: ")).trim().toLowerCase();
  if (!raw) {
    writeLine("  [!] Email is required.");
    continue;
  }
  if (!isValidEmail(raw)) {
    writeLine("  [!] Enter a valid email address.");
    continue;
  }
  // Check for duplicate in DB
  const [[{ dup }]] = await db.execute(
    "SELECT COUNT(*) AS dup FROM auth_users WHERE LOWER(email) = ?",
    [raw],
  );
  if (Number(dup) > 0) {
    writeLine("  [!] An account with this email already exists. Use a different email.");
    continue;
  }
  email = raw;
  break;
}

// Full name
let fullName;
while (true) {
  const raw = (await prompt(rl, "  Full name:     ")).trim();
  if (!raw) {
    writeLine("  [!] Full name is required.");
    continue;
  }
  if (raw.length > 200) {
    writeLine("  [!] Full name must be 200 characters or fewer.");
    continue;
  }
  fullName = raw;
  break;
}

// Organization
let organization;
while (true) {
  const raw = (await prompt(rl, "  Organization:  ")).trim();
  if (!raw) {
    writeLine("  [!] Organization / hospital name is required.");
    continue;
  }
  if (raw.length > 200) {
    writeLine("  [!] Organization must be 200 characters or fewer.");
    continue;
  }
  organization = raw;
  break;
}

// Password
writeLine("");
writeLine("  Password requirements:");
writeLine("    • At least 10 characters");
writeLine("    • At least one uppercase letter");
writeLine("    • At least one lowercase letter");
writeLine("    • At least one number");
writeLine("    • At least one special character");
writeLine("");

let password;
while (true) {
  const pw = await promptPassword(rl, "  Password:      ");
  const err = passwordError(pw);
  if (err) {
    writeLine("  [!] " + err);
    continue;
  }
  const confirm = await promptPassword(rl, "  Confirm:       ");
  if (pw !== confirm) {
    writeLine("  [!] Passwords do not match. Try again.");
    continue;
  }
  password = pw;
  break;
}

rl.close();

// ── Confirmation before writing ───────────────────────────────────────────

writeLine("");
writeLine("  ─── Review ───────────────────────────────────────────────");
writeLine(`  Email:        ${email}`);
writeLine(`  Name:         ${fullName}`);
writeLine(`  Organization: ${organization}`);
writeLine(`  Role:         Super Admin (role='admin', custom_label='super_admin')`);
writeLine("  ──────────────────────────────────────────────────────────");
writeLine("");

// Re-open readline for final yes/no
const rl2 = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
const confirm = (await prompt(rl2, "  Create this Super Admin account? [yes/no]: "))
  .trim()
  .toLowerCase();
rl2.close();

if (confirm !== "yes") {
  writeLine("\n  Aborted. No changes were made.");
  await db.end();
  process.exit(0);
}

// ── Hash password (cost factor 12, matching server.js) ───────────────────

writeLine("\n  Hashing password…");
const passwordHash = await bcrypt.hash(password, 12);
// Immediately overwrite password variable so it cannot be inspected in a heap dump
password = null;

// ── Transactional account creation ───────────────────────────────────────

const id = randomUUID(); // Same UUID for auth_users.id, profiles.id, user_roles.user_id

writeLine("  Writing to database…");

await db.beginTransaction();
try {
  // 1. auth_users
  await db.execute(
    `INSERT INTO auth_users
     (id, email, password_hash, email_verified, is_active)
     VALUES (?, ?, ?, 1, 1)`,
    [id, email, passwordHash],
  );

  // 2. profiles
  await db.execute(
    `INSERT INTO profiles
     (id, email, full_name, organization, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [id, email, fullName, organization],
  );

  // 3. user_roles — Super Admin
  await db.execute(
    `INSERT INTO user_roles
     (id, user_id, role, custom_label)
     VALUES (?, ?, 'admin', 'super_admin')`,
    [randomUUID(), id],
  );

  await db.commit();
} catch (err) {
  await db.rollback();
  await db.end();
  die("Transaction failed and was rolled back. No account was created.\nReason: " + err.message);
}

// ── Post-creation verification ────────────────────────────────────────────

writeLine("  Verifying…");

const [[authRow]] = await db.execute(
  "SELECT id FROM auth_users WHERE id = ? AND is_active = 1 AND email_verified = 1",
  [id],
);
const [[profileRow]] = await db.execute(
  "SELECT id FROM profiles WHERE id = ? AND status = 'active'",
  [id],
);
const [[{ roleCount }]] = await db.execute(
  "SELECT COUNT(*) AS roleCount FROM user_roles WHERE user_id = ? AND role = 'admin' AND custom_label = 'super_admin'",
  [id],
);
const [[{ totalSuperAdmins }]] = await db.execute(
  "SELECT COUNT(*) AS totalSuperAdmins FROM user_roles WHERE role = 'admin' AND custom_label = 'super_admin'",
);

await db.end();

const verificationFailed =
  !authRow ||
  !profileRow ||
  Number(roleCount) !== 1 ||
  Number(totalSuperAdmins) !== 1;

if (verificationFailed) {
  die(
    "Verification failed after account creation.\n" +
    "The transaction committed but verification queries returned unexpected results.\n" +
    "Check the database manually before proceeding.\n" +
    `  auth_users row:    ${authRow ? "FOUND" : "MISSING"}\n` +
    `  profiles row:      ${profileRow ? "FOUND" : "MISSING"}\n` +
    `  super_admin roles: ${roleCount} (expected 1)\n` +
    `  total super_admin: ${totalSuperAdmins} (expected 1)`,
  );
}

// ── Success ───────────────────────────────────────────────────────────────

writeLine("");
writeLine("╔════════════════════════════════════════════════════════════╗");
writeLine("║              Super Admin created successfully.             ║");
writeLine("╚════════════════════════════════════════════════════════════╝");
writeLine("");
writeLine(`  Email:  ${email}`);
writeLine(`  Name:   ${fullName}`);
writeLine("");
writeLine("  Next steps:");
writeLine("  1. Sign in at /login with the email and password you entered.");
writeLine("  2. Visit /access-control to approve users and assign roles.");
writeLine("  3. Use /access-control to create Hospital Admins and Admins.");
writeLine("");
writeLine("  Security reminder:");
writeLine("  • The password was hashed at cost-12 and never logged.");
writeLine("  • All non-Super Admin accounts require admin approval.");
writeLine("  • Running this command again will safely abort (no duplicate).");
writeLine("");
