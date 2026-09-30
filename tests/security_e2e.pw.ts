import { expect, test } from "@playwright/test";

const targetUrl = process.env.TARGET_URL ?? "http://127.0.0.1:4173";
const requireSecurityHeaders = process.env.EXPECT_SECURITY_HEADERS === "1";

test("CareOrbit shell loads without exposing obvious client-side secrets", async ({ page }) => {
  const response = await page.goto(targetUrl, { waitUntil: "networkidle" });
  expect(response?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/CareOrbit/i);

  const html = await page.content();
  expect(html).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|service_role|BEGIN PRIVATE KEY/i);

  const storageKeys = await page.evaluate(() => Object.keys(window.localStorage));
  expect(storageKeys.join("\n")).not.toMatch(/supabase|auth|token|careorbit/i);
});

test("signup page does not offer admin-tier self-service roles", async ({ page }) => {
  await page.goto(new URL("/signup", targetUrl).toString(), { waitUntil: "networkidle" });
  await expect(page.getByLabel("Your role")).toBeVisible();
  const options = await page.locator("select#role option").allTextContents();
  expect(options.join("|")).not.toMatch(/Super Admin|Hospital Admin|\bAdmin\b/);
});

test("production security headers are present when required", async ({ request }) => {
  test.skip(!requireSecurityHeaders, "local dev server does not apply Vercel edge headers");

  const response = await request.get(targetUrl);
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("default-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=63072000");
});
