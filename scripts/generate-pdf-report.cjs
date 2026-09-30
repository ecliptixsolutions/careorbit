const { jsPDF } = require("jspdf");
const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

const pageWidth = 210;
const margin = 18;
const contentWidth = pageWidth - 2 * margin;
let y = margin;
let pageNum = 1;

function addPage() {
  doc.addPage();
  y = margin;
  pageNum++;
}

function checkPage() {
  if (y > 275) addPage();
}

function textW(t, size, style, maxW) {
  doc.setFontSize(size || 10);
  if (style) doc.setFont(undefined, style);
  else doc.setFont(undefined, "normal");
  const lines = doc.splitTextToSize(t, maxW || contentWidth);
  lines.forEach((l) => {
    checkPage();
    doc.text(l, margin, y);
    y += (size || 10) * 0.45;
  });
}

function drawTable(headers, data, colWidths) {
  const rowH = 5;
  const headerH = 6.5;
  let startY = y;

  if (startY + headerH + data.length * rowH > 285) {
    addPage();
    startY = y;
  }

  doc.setFillColor(30, 58, 95);
  let cx = margin;
  headers.forEach((h, i) => {
    doc.rect(cx, startY, colWidths[i], headerH, "F");
    cx += colWidths[i];
  });

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(6.5);
  doc.setFont(undefined, "bold");
  cx = margin;
  headers.forEach((h, i) => {
    doc.text(h, cx + 1, startY + 4.2);
    cx += colWidths[i];
  });

  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, "normal");
  let rowY = startY + headerH;

  data.forEach((row, ri) => {
    if (rowY > 285) {
      addPage();
      rowY = y;
      doc.setFillColor(30, 58, 95);
      let cx2 = margin;
      headers.forEach((h, i) => {
        doc.rect(cx2, rowY, colWidths[i], headerH, "F");
        cx2 += colWidths[i];
      });
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(6.5);
      doc.setFont(undefined, "bold");
      cx2 = margin;
      headers.forEach((h, i) => {
        doc.text(h, cx2 + 1, rowY + 4.2);
        cx2 += colWidths[i];
      });
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, "normal");
      rowY += headerH;
    }

    if (ri % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      let cx3 = margin;
      colWidths.forEach((w) => {
        doc.rect(cx3, rowY, w, rowH, "F");
        cx3 += w;
      });
    }
    doc.setFontSize(6);
    cx = margin;
    row.forEach((cell, ci) => {
      doc.text(String(cell), cx + 0.8, rowY + 3.5);
      cx += colWidths[ci];
    });
    rowY += rowH;
  });

  y = rowY + 3;
}

// ===== COVER =====
doc.setFillColor(30, 58, 95);
doc.rect(0, 0, pageWidth, 60, "F");
doc.setTextColor(255, 255, 255);
doc.setFontSize(26);
doc.setFont(undefined, "bold");
doc.text("CareOrbit Security Audit Report", margin, 30);
doc.setFontSize(12);
doc.setFont(undefined, "normal");
doc.text("Healthcare ERP + EMR + AI  |  July 8, 2026", margin, 44);
doc.setTextColor(0, 0, 0);

y = 80;

// Meta box
doc.setFillColor(241, 245, 249);
doc.rect(margin, y, contentWidth, 45, "F");
doc.setFontSize(10);
const meta = [
  ["Application:", "CareOrbit"],
  ["Production URL:", "https://janani-careorbit.vercel.app/"],
  ["Tech Stack:", "TanStack Start, React 19, Supabase/PostgreSQL, Vercel"],
  ["Data Sensitivity:", "PHI (Protected Health Information)"],
  ["Compliance:", "HIPAA, DPDP Act 2023, ABDM"],
];
meta.forEach((m, i) => {
  doc.setFont(undefined, "bold");
  doc.text(m[0], margin + 3, y + 7 + i * 8);
  doc.setFont(undefined, "normal");
  doc.text(m[1], margin + 42, y + 7 + i * 8);
});
y += 55;

// ===== 1. EXECUTIVE SUMMARY =====
checkPage();
doc.setFontSize(16);
doc.setFont(undefined, "bold");
doc.setTextColor(220, 38, 38);
doc.text("1. Executive Summary", margin, y);
y += 8;
doc.setTextColor(0, 0, 0);

const boxes = [
  { label: "Critical", count: 3, color: [220, 38, 38] },
  { label: "High", count: 4, color: [234, 88, 12] },
  { label: "Medium", count: 5, color: [202, 138, 4] },
  { label: "Low", count: 3, color: [22, 163, 74] },
  { label: "Total", count: 15, color: [30, 58, 95] },
];
const boxW = 34;
const boxGap = 4;
boxes.forEach((b, i) => {
  const x = margin + i * (boxW + boxGap);
  doc.setFillColor(b.color[0], b.color[1], b.color[2]);
  doc.roundedRect(x, y, boxW, 18, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont(undefined, "bold");
  doc.text(String(b.count), x + boxW / 2, y + 9, { align: "center" });
  doc.setFontSize(7);
  doc.setFont(undefined, "normal");
  doc.text(b.label, x + boxW / 2, y + 15, { align: "center" });
});
y += 25;
doc.setTextColor(0, 0, 0);

textW(
  "This audit identified 15 security findings across the CareOrbit application. The three critical vulnerabilities \u2014 an exposed database admin key, auth tokens stored in browser localStorage, and the ability for anyone to self-assign admin privileges \u2014 represent existential risks for a healthcare application handling real patient data under HIPAA/DPDP compliance.",
  10,
);
y += 2;
textW(
  "The application has strong foundations (audit triggers on all tables, well-designed stored procedures with role checks, RLS-enabled tables), but the critical and high-severity issues must be addressed before the system can be considered production-ready.",
  10,
);
y += 3;
checkPage();
doc.setFont(undefined, "bold");
doc.setTextColor(220, 38, 38);
doc.setFontSize(11);
doc.text("Security Rating: 1.5 / 5", margin, y);
y += 9;
doc.setTextColor(0, 0, 0);

// ===== 2. DATA CONFIRMATION =====
checkPage();
doc.setFontSize(16);
doc.setFont(undefined, "bold");
doc.setTextColor(30, 58, 95);
doc.text("2. Data-Protection Confirmation", margin, y);
y += 9;
doc.setTextColor(0, 0, 0);

doc.setFillColor(240, 253, 244);
doc.rect(margin, y, contentWidth, 14, "F");
doc.setFontSize(9);
doc.setFont(undefined, "italic");
textW(
  "No real CareOrbit patient, staff, appointment, prescription, billing, payment, authentication, storage, or hospital record was intentionally created, edited, deleted, overwritten, exported, or otherwise modified during this assessment.",
  9,
);
y += 2;
doc.setFont(undefined, "normal");
doc.setFontSize(9);

const confirms = [
  "No source code was modified",
  "No project file was removed",
  "No dependency was updated",
  "No database migration was executed",
  "No deployment was performed",
  "No production configuration was changed",
  "No destructive security test was executed",
  "No brute-force, SQLi, XSS, or penetration testing was run against production",
];
confirms.forEach((c) => {
  checkPage();
  doc.text("\u2022  " + c, margin, y);
  y += 5;
});
y += 3;

// ===== 3. FINDINGS TABLE =====
checkPage();
doc.setFontSize(16);
doc.setFont(undefined, "bold");
doc.setTextColor(30, 58, 95);
doc.text("3. Complete Findings Table", margin, y);
y += 9;
doc.setTextColor(0, 0, 0);

const colW = [13, 60, 15, 55, 47];
const hdr = ["ID", "Vulnerability", "Severity", "Location", "Fix Action"];
const rows = [
  [
    "CR-001",
    "SUPABASE_SERVICE_ROLE_KEY exposed",
    "Critical",
    ".env file",
    "Rotate key, remove from .env",
  ],
  [
    "CR-002",
    "Auth tokens in localStorage",
    "Critical",
    "client.ts:26",
    "Migrate to httpOnly cookies",
  ],
  ["CR-003", "Self-register any role", "Critical", "signup.tsx:197", "Remove admin from signup"],
  ["HI-001", "Wildcard CORS (*)", "High", "Vercel headers", "Restrict origins"],
  ["HI-002", "Missing security headers", "High", "vercel.json", "Add all security headers"],
  ["HI-003", "All users see ALL patients", "High", "RLS: patients table", "Fix RLS policy"],
  ["HI-004", "Client-side RBAC only", "High", "app-shell.tsx:103", "Add server middleware"],
  ["ME-001", "No rate limiting on login", "Medium", "Auth endpoints", "Add rate limiter"],
  ["ME-002", "No CSRF protection", "Medium", "All state changes", "Add CSRF tokens"],
  ["ME-003", "Password mismatch 10 vs 8", "Medium", "password-security.ts", "Align to 10 chars"],
  ["ME-004", "Error messages to users", "Medium", "__root.tsx:34", "Show generic errors"],
  ["ME-005", "dangerouslySetInnerHTML", "Medium", "chart.tsx:73", "Use CSS variables"],
  [
    "LO-001",
    "localStorage for notifications",
    "Low",
    "use-notifications.ts",
    "Server-side tracking",
  ],
  ["LO-002", "Role templates in localStorage", "Low", "access-control.tsx", "Server-side storage"],
  ["LO-003", "Cache-Control: public", "Low", "Vercel headers", "Use private/no-store"],
];

drawTable(hdr, rows, colW);

// ===== 4. DETAILED FINDINGS =====
checkPage();
doc.setFontSize(16);
doc.setFont(undefined, "bold");
doc.setTextColor(30, 58, 95);
doc.text("4. Detailed Findings", margin, y);
y += 9;
doc.setTextColor(0, 0, 0);

function renderFinding(id, title, issue, why, fix, impact, severity) {
  checkPage();
  const colors =
    severity === "critical"
      ? { bg: [254, 242, 242], bar: [220, 38, 38], text: [220, 38, 38], title: "CRITICAL" }
      : severity === "high"
        ? { bg: [255, 247, 237], bar: [234, 88, 12], text: [234, 88, 12], title: "HIGH" }
        : { bg: [255, 251, 235], bar: [202, 138, 4], text: [202, 138, 4], title: "MEDIUM" };

  doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
  doc.rect(margin, y, contentWidth, 6.5, "F");
  doc.setFillColor(colors.bar[0], colors.bar[1], colors.bar[2]);
  doc.rect(margin, y, 3, 6.5, "F");
  doc.setFontSize(9.5);
  doc.setFont(undefined, "bold");
  doc.setTextColor(colors.text[0], colors.text[1], colors.text[2]);
  doc.text(id + ": " + title, margin + 5, y + 4.8);
  y += 9;

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");

  const sections = [
    ["The Issue:", issue],
    ["Why It Occurs:", why],
    ["What to Change:", fix],
    ["Impact if Exploited:", impact],
  ];

  sections.forEach((s) => {
    checkPage();
    doc.setFont(undefined, "bold");
    doc.text(s[0], margin, y);
    y += 4.5;
    doc.setFont(undefined, "normal");
    textW(s[1], 9);
    y += 2;
  });
  y += 3;
}

// Critical
checkPage();
doc.setFontSize(14);
doc.setFont(undefined, "bold");
doc.setTextColor(220, 38, 38);
doc.text("CRITICAL SEVERITY", margin, y);
y += 8;
doc.setTextColor(0, 0, 0);

renderFinding(
  "CR-001",
  "SUPABASE_SERVICE_ROLE_KEY Exposed in .env",
  "The .env file contains SUPABASE_SERVICE_ROLE_KEY in plain text. This key has full admin access to the Supabase project and bypasses ALL Row Level Security.",
  "The .env file was created locally for development convenience. Even though .gitignore now prevents git tracking, it persists on every developer machine.",
  "1. Rotate the key immediately in Supabase Dashboard \u2192 Project Settings \u2192 API. 2. Delete SUPABASE_SERVICE_ROLE_KEY from .env. 3. Use Vercel Environment Variables only. 4. Check git history: if committed, use git filter-branch to purge it.",
  "Total database compromise. An attacker with this key can read, modify, or delete ALL patient records, prescriptions, invoices, and user accounts. This is a reportable HIPAA breach.",
  "critical",
);

renderFinding(
  "CR-002",
  "Auth Tokens Stored in localStorage",
  "Supabase session tokens (JWTs) are stored in localStorage, configured at src/integrations/supabase/client.ts:26. Any XSS vulnerability on any page lets an attacker steal tokens and hijack active sessions.",
  "The code explicitly sets storage: localStorage because the Supabase client defaults to browser localStorage for persistence. localStorage is accessible to ANY JavaScript running on the same origin \u2014 no httpOnly cookie protection.",
  "Replace localStorage with httpOnly, Secure, SameSite=Strict cookies. Use @supabase/ssr package or configure cookies from SSR middleware. Remove the explicit storage: localStorage config.",
  "Persistent session hijacking. An attacker who finds an XSS vulnerability can steal all active tokens and impersonate any user, including administrators.",
  "critical",
);

renderFinding(
  "CR-003",
  "Self-Registration Allows Any Role",
  'The signup page shows ALL roles including super_admin, hospital_admin, and admin. The UI says "accounts are approved immediately with the selected role rights."',
  "The signupRoleOptions array in src/lib/access-control.ts:317-330 includes all role keys. The Supabase trigger handle_new_user() accepts whatever role the user sends without verification.",
  'Remove super_admin, hospital_admin, admin from signupRoleOptions. Require all new users to be created with "pending" role. Only allow existing admins to approve higher-privilege roles.',
  "Anyone visiting the signup page can create an admin account and take full system control \u2014 access all patient data, modify settings, manage users.",
  "critical",
);

// High
checkPage();
doc.setFontSize(14);
doc.setFont(undefined, "bold");
doc.setTextColor(234, 88, 12);
doc.text("HIGH SEVERITY", margin, y);
y += 8;
doc.setTextColor(0, 0, 0);

renderFinding(
  "HI-001",
  "Wildcard CORS (Access-Control-Allow-Origin: *)",
  "Production returns Access-Control-Allow-Origin: *, allowing any website to make cross-origin requests.",
  "Default Vercel configuration. Also hardcoded in supabase/functions/invite-staff/index.ts:4.",
  "In vercel.json, add header rule restricting origin to your domain. Update the invite-staff function to check origin header.",
  "Any website can make authenticated requests to the app if a user is logged in, enabling CSRF-like data exfiltration.",
  "high",
);

renderFinding(
  "HI-002",
  "Missing Security Headers",
  "Production responses lack: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy.",
  "No security headers configured in vercel.json or anywhere in the application.",
  "Add all headers in vercel.json. Reference the recommended config shown in the RLS Health Check section of this report.",
  "Increased attack surface for XSS, clickjacking, MIME-type-sniffing attacks, and referrer leakage.",
  "high",
);

renderFinding(
  "HI-003",
  "All Authenticated Users Can View ALL Patient Records",
  "RLS policy uses using(true) on patients table. Any logged-in user can see every patient's name, phone, email, address, blood group, allergies.",
  "Initial RLS policy written broadly for development and never tightened for production. Also affects appointments and pharmacy_items tables.",
  "Replace using(true) with role-based checks. Use has_role() and has_custom_role() functions to restrict access to authorized roles.",
  "HIPAA violation. Any employee or compromised account can access all protected health information in the system.",
  "high",
);

renderFinding(
  "HI-004",
  "Client-Side RBAC Without Server Enforcement",
  "Navigation visibility controlled in browser via useRoleAccess(), Supabase queries run directly from client. requireSupabaseAuth middleware exists but is never used.",
  "Common SPA pattern that relies solely on RLS for server enforcement. If any RLS policy is misconfigured, there is no defense-in-depth.",
  "Apply requireSupabaseAuth middleware to server functions. Audit all RLS policies to match intended permissions. Add server-side route guards.",
  'Users with "pending" status or compromised accounts could bypass client-side checks and access unauthorized data through direct Supabase API calls.',
  "high",
);

// Medium
checkPage();
doc.setFontSize(14);
doc.setFont(undefined, "bold");
doc.setTextColor(202, 138, 4);
doc.text("MEDIUM SEVERITY", margin, y);
y += 8;
doc.setTextColor(0, 0, 0);

const mediumFindings = [
  [
    "ME-001",
    "No Rate Limiting on Login",
    "No rate-limit mechanism exists. An attacker can brute-force passwords at full speed. Fix: Verify Supabase built-in rate limits are enabled and add app-level rate limiting (5 attempts/15 min per IP + email).",
  ],
  [
    "ME-002",
    "No CSRF Protection",
    "No CSRF tokens or SameSite cookie attributes configured. Fix: Add SameSite=Strict to auth cookies and implement CSRF token validation on state-changing endpoints.",
  ],
  [
    "ME-003",
    "Password Validation Mismatch",
    "password-security.ts requires 10 chars minimum, but signup.tsx checks for 8. Fix: Align both to 10-character minimum (recommended for healthcare apps).",
  ],
  [
    "ME-004",
    "Error Messages Exposed to Users",
    "__root.tsx:34 renders error.message directly to users, potentially leaking stack traces and internal paths. Fix: Show generic message, log actual error server-side.",
  ],
  [
    "ME-005",
    "dangerouslySetInnerHTML in Chart",
    "chart.tsx:73 uses dangerouslySetInnerHTML for injected CSS. Current usage is low-risk (hex colors only) but sets a bad pattern. Fix: Use React CSS variables.",
  ],
];

mediumFindings.forEach((f) => {
  checkPage();
  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  doc.setTextColor(202, 138, 4);
  doc.text(f[0] + ": " + f[1], margin, y);
  y += 5;
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, "normal");
  textW(f[2], 9);
  y += 3;
});

// Low
checkPage();
doc.setFontSize(14);
doc.setFont(undefined, "bold");
doc.setTextColor(22, 163, 74);
doc.text("LOW SEVERITY", margin, y);
y += 8;
doc.setTextColor(0, 0, 0);

const lowText =
  "LO-001: Notification read state stored in localStorage (use-notifications.ts:34). An attacker clearing localStorage resets read state. Fix: Move to server-side tracking. LO-002: Custom role templates stored in localStorage (access-control.tsx:56). Fix: Use server-side persistence. LO-003: Cache-Control: public on authenticated responses could allow intermediate caches to store sensitive content. Fix: Use private, no-store.";
textW(lowText, 9);
y += 5;

// ===== 5. ACTION PLAN =====
checkPage();
doc.setFontSize(16);
doc.setFont(undefined, "bold");
doc.setTextColor(30, 58, 95);
doc.text("5. Action Plan \u2014 From 1.5 to 4.5/5", margin, y);
y += 9;
doc.setTextColor(0, 0, 0);

const phases = [
  {
    title: "Phase 1: Immediate (0-24 hours)",
    items: [
      "Rotate SUPABASE_SERVICE_ROLE_KEY in Supabase Dashboard",
      "Delete service role key from all .env files on every machine",
      "Remove super_admin, hospital_admin, admin from signupRoleOptions",
      "Change auth token storage from localStorage to httpOnly cookies",
    ],
  },
  {
    title: "Phase 2: High Priority (1-3 days)",
    items: [
      "Fix RLS: replace using(true) on patients table with role check",
      "Fix RLS: same fix on appointments and pharmacy_items",
      "Add security headers in vercel.json",
      "Restrict CORS from * to specific origins",
    ],
  },
  {
    title: "Phase 3: Medium Priority (1-2 weeks)",
    items: [
      "Add rate limiting on login",
      "Add CSRF protection (tokens + SameSite cookies)",
      "Apply requireSupabaseAuth middleware to server routes",
      "Fix password validation (align to 10 chars)",
      "Fix error message exposure (show generic errors)",
    ],
  },
  {
    title: "Phase 4: Long-Term Improvements",
    items: [
      "Run penetration test in staging with dummy data",
      "Configure automated dependency updates (Dependabot)",
      "Add Subresource Integrity for third-party scripts",
      "Regular RLS policy reviews in deployment checklist",
      "Implement session invalidation on password change",
      "Set up audit log review workflows",
    ],
  },
];

phases.forEach((phase) => {
  checkPage();
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 6, "F");
  doc.setFontSize(10);
  doc.setFont(undefined, "bold");
  doc.setTextColor(30, 58, 95);
  doc.text(phase.title, margin + 2, y + 4.5);
  y += 9;
  doc.setFontSize(9);
  doc.setFont(undefined, "normal");
  doc.setTextColor(0, 0, 0);
  phase.items.forEach((item) => {
    checkPage();
    doc.text("\u2022  " + item, margin, y);
    y += 5;
  });
  y += 3;
});

// ===== 6. RLS HEALTH CHECK =====
checkPage();
doc.setFontSize(16);
doc.setFont(undefined, "bold");
doc.setTextColor(30, 58, 95);
doc.text("6. RLS Policy Health Check", margin, y);
y += 9;
doc.setTextColor(0, 0, 0);

const rlsColW = [28, 14, 50, 52, 46];
const rlsHdr = ["Table", "RLS", "SELECT Policy", "INSERT/UPDATE/DELETE", "Verdict"];
const rlsRows = [
  ["profiles", "Yes", "All authenticated", "Own profile only", "PASS"],
  ["user_roles", "Yes", "Own + admins + doctors", "Admins only", "PASS"],
  ["patients", "Yes", "ALL authenticated", "Role-gated", "FAIL"],
  ["appointments", "Yes", "ALL authenticated", "Role-gated", "FAIL"],
  ["prescriptions", "Yes", "Clinical roles", "Doctors + admins", "PASS"],
  ["invoices", "Yes", "Billing roles", "Billing roles", "PASS"],
  ["payments", "Yes", "Billing roles", "Billing roles", "PASS"],
  ["lab_orders", "Yes", "Clinical roles", "Clinical roles", "PASS"],
  ["pharmacy_items", "Yes", "ALL authenticated", "Pharmacy roles", "FAIL"],
  ["dispensations", "Yes", "Clinical roles", "Pharmacy roles", "PASS"],
  ["notifications", "Yes", "Own + admins", "Own + admins", "PASS"],
  ["audit_logs", "Yes", "Admins only", "Triggers only", "PASS"],
];

drawTable(rlsHdr, rlsRows, rlsColW);

// ===== 7. HEADER SCAN =====
checkPage();
doc.setFontSize(16);
doc.setFont(undefined, "bold");
doc.setTextColor(30, 58, 95);
doc.text("7. Production Security Header Scan", margin, y);
y += 9;
doc.setTextColor(0, 0, 0);

const hdrColW = [52, 60, 60, 18];
const hdrHdr = ["Header", "Current Value", "Required Value", "Status"];
const hdrRows = [
  ["Access-Control-Allow-Origin", "*", "Your domain only", "FAIL"],
  [
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
    "Same (good)",
    "PASS",
  ],
  ["Content-Security-Policy", "MISSING", "default-src self; ...", "FAIL"],
  ["X-Content-Type-Options", "MISSING", "nosniff", "FAIL"],
  ["X-Frame-Options", "MISSING", "DENY", "FAIL"],
  ["Referrer-Policy", "MISSING", "strict-origin-when-cross-origin", "FAIL"],
  ["Permissions-Policy", "MISSING", "geolocation=(), microphone=(), camera=()", "FAIL"],
  ["Cache-Control", "public, max-age=0", "private, no-store", "WARN"],
];

drawTable(hdrHdr, hdrRows, hdrColW);

// ===== 8. CLOSING =====
checkPage();
doc.line(margin, y, pageWidth - margin, y);
y += 6;
doc.setFontSize(9);
doc.setTextColor(100, 116, 139);
doc.setFont(undefined, "italic");
doc.text(
  "Report generated: July 8, 2026  |  Audit type: Read-only static code + production header review",
  margin,
  y,
);
y += 5;
doc.setFont(undefined, "normal");
doc.text("No source code, data, or configuration was modified during this assessment.", margin, y);

// Footer on all pages
for (let i = 1; i <= pageNum; i++) {
  doc.setPage(i);
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("CareOrbit Security Audit Report  |  Page " + i + " of " + pageNum, pageWidth / 2, 292, {
    align: "center",
  });
}

const outPath = "docs/CareOrbit_Security_Audit_Report.pdf";
doc.save(outPath);
console.log("PDF saved to " + outPath);
