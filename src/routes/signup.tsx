import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { type RoleKey } from "@/lib/access-control";
import { passwordError, passwordRequirements } from "@/lib/password-security";

// Public signup may only request non-privileged roles.
// super_admin / hospital_admin / admin require admin invitation — not self-signup.
const publicSignupRoleOptions: Array<{ value: Exclude<RoleKey, "pending" | "custom" | "super_admin" | "hospital_admin" | "admin">; label: string }> = [
  { value: "staff", label: "Staff" },
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "pharmacist", label: "Pharmacist" },
  { value: "lab_technician", label: "Lab Technician" },
  { value: "billing_operator", label: "Billing Operator" },
];

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

const passwordCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*?";

function getPasswordChecks(password: string) {
  return passwordRequirements.map((rule) => ({ ...rule, passed: rule.test(password) }));
}

function getRandomIndex(length: number) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % length;
}

function generateStrongPassword() {
  const requiredCharacters = ["A", "z", "7", "!"];
  const remainingCharacters = Array.from({ length: 10 }, () => {
    return passwordCharacters[getRandomIndex(passwordCharacters.length)];
  });

  return [...requiredCharacters, ...remainingCharacters]
    .map((character) => ({ character, sort: getRandomIndex(1000) }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ character }) => character)
    .join("");
}

function SignupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<RoleKey>("staff");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  const handleSubmit = async () => {
    if (loading) return;
    const trimmedFullName = fullName.trim();
    const trimmedEmail = email.trim().toLowerCase();

    setSubmitted(true);

    if (!trimmedFullName || !trimmedEmail || !password) {
      setErrorMessage("Please fill the required fields");
      toast.error("Please fill the required fields");
      return;
    }

    const weakPasswordReason = passwordError(password);
    if (weakPasswordReason) {
      setErrorMessage("Password does not meet all strength requirements");
      toast.error(`Password needs: ${weakPasswordReason}`);
      return;
    }

    setLoading(true);
    setErrorMessage("");

    const { data, error } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: {
        data: {
          full_name: trimmedFullName,
          organization: organization.trim() || undefined,
          phone: phone.trim() || undefined,
          role,
        },
      },
    });

    setLoading(false);

    if (error) {
      // Provide meaningful messages for common server responses
      const msg =
        error.message === "Request failed"
          ? "Could not reach the server. Please check your connection and try again."
          : error.status === 409
          ? "An account with this email already exists. Please sign in instead."
          : error.status === 429
          ? "Too many signup attempts. Please wait a minute and try again."
          : error.message || "Signup failed. Please try again.";
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    if (data?.pending_approval) {
      setPendingApproval(true);
      toast.success("Account created. Waiting for admin approval.");
      return;
    }

    toast.success("Account created. Please sign in.");
    navigate({ to: "/login" });
  };

  const handleSuggestPassword = () => {
    setPassword(generateStrongPassword());
    toast.success("Strong password generated");
  };

  const goToCredentialsStep = () => {
    setSubmitted(true);

    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name");
      toast.error("Please enter your full name");
      return;
    }

    setErrorMessage("");
    setStep(2);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-md rounded-[18px] border border-border bg-card p-6 shadow-sm">
        <Link to="/" className="mb-4 inline-block text-sm font-semibold text-primary">
          CareOrbit
        </Link>

        {pendingApproval ? (
          <div className="mt-4 space-y-4">
            <h1 className="text-2xl font-semibold text-heading">Account created</h1>
            <div className="rounded-xl border border-border bg-muted/60 p-4 text-sm">
              <div className="font-medium text-foreground">Waiting for admin approval</div>
              <p className="mt-1 text-muted-foreground">
                Your account has been created, but your requested role requires approval from a
                Super Admin, Hospital Admin, or Admin before you can access CareOrbit workflows.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-block w-full rounded-xl bg-gradient-brand py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:opacity-95"
            >
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-heading">Create your account</h1>
            <p className="mt-1 text-sm text-muted-foreground">Start managing your facility today</p>
            <div className="mt-4 text-xs text-muted-foreground">Step {step} of 2</div>

            <form
              className="mt-6 space-y-4"
              autoComplete="on"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              {step === 1 ? (
                <>
                  <div>
                    <label htmlFor="name" className="mb-1 block text-sm font-medium">
                      Full name
                    </label>
                    <input
                      id="name"
                      name="name"
                      value={fullName}
                      onChange={(event) => {
                        setErrorMessage("");
                        setFullName(event.target.value);
                      }}
                      autoComplete="name"
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="org" className="mb-1 block text-sm font-medium">
                      Organization
                    </label>
                    <input
                      id="org"
                      name="organization"
                      value={organization}
                      onChange={(event) => setOrganization(event.target.value)}
                      autoComplete="organization"
                      placeholder="Clinic / Hospital name"
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <label htmlFor="role" className="mb-1 block text-sm font-medium">
                      Your role
                    </label>
                    <select
                      id="role"
                      name="role"
                      aria-label="Your role"
                      value={role}
                      onChange={(e) => {
                        setRole(e.target.value as RoleKey);
                        setErrorMessage("");
                      }}
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      {publicSignupRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Staff and Doctor accounts are active immediately. Nurse, Pharmacist, Lab
                      Technician, and Billing Operator accounts require admin approval.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="phone" className="mb-1 block text-sm font-medium">
                      Phone / WhatsApp number
                    </label>
                    <input
                      id="phone"
                      name="phone"
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                      type="tel"
                      autoComplete="tel"
                      placeholder="Required for phone notifications"
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="email" className="mb-1 block text-sm font-medium">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      value={email}
                      onChange={(event) => {
                        setErrorMessage("");
                        setEmail(event.target.value);
                      }}
                      type="email"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <label htmlFor="password" className="block text-sm font-medium">
                        Password
                      </label>
                      <button
                        type="button"
                        className="text-xs text-primary"
                        onClick={handleSuggestPassword}
                      >
                        Suggest
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="password"
                        name="password"
                        value={password}
                        onChange={(event) => {
                          setErrorMessage("");
                          setPassword(event.target.value);
                        }}
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="h-11 w-full rounded-xl border border-border bg-surface pl-3 pr-11 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current) => !current)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center text-muted-foreground transition hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    <div className="mt-3 rounded-xl border border-border bg-muted/60 p-3 text-xs text-muted-foreground">
                      <div className="mb-2 font-medium text-foreground">Password requirements</div>
                      <ul className="grid gap-1.5">
                        {passwordRequirements.map((rule) => (
                          <li key={rule.label}>{rule.label}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              )}

              {submitted && errorMessage && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}

              <div className="flex gap-3">
                {step === 2 && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      setErrorMessage("");
                      setStep(1);
                    }}
                    className="h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-semibold text-heading transition hover:bg-accent"
                  >
                    Back
                  </button>
                )}

                {step === 1 ? (
                  <button
                    type="button"
                    onClick={goToCredentialsStep}
                    className="h-11 flex-1 rounded-xl bg-gradient-brand text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2"
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={loading}
                    className="h-11 flex-1 rounded-xl bg-gradient-brand text-sm font-semibold text-white shadow-sm transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 disabled:opacity-50"
                  >
                    {loading ? "Creating..." : "Create account"}
                  </button>
                )}
              </div>
            </form>

            <p className="mt-6 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
