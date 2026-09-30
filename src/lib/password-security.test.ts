import { describe, expect, it } from "vitest";
import { isValidEmail, passwordError } from "./password-security";

describe("password security", () => {
  it("accepts a strong password", () => {
    expect(passwordError("CareOrbit!2026")).toBeNull();
  });

  it("rejects weak passwords", () => {
    expect(passwordError("password")).not.toBeNull();
  });

  it("validates email syntax", () => {
    expect(isValidEmail("staff@example.com")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
  });
});
