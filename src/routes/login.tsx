import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Activity, Eye, EyeOff, HeartPulse, Lock, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type FieldErrors = { email?: string; password?: string };

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) navigate({ to: "/dashboard" });
    });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (loading) return;
    const trimmedEmail = email.trim().toLowerCase();

    const nextErrors: FieldErrors = {};
    if (!trimmedEmail) nextErrors.email = "Please enter your work email.";
    if (!password) nextErrors.password = "Please enter your password.";
    setErrors(nextErrors);

    if (nextErrors.email || nextErrors.password) return;

    setLoading(true);
    setErrorMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: trimmedEmail, password });
    setLoading(false);

    if (error) {
      setErrorMessage(error.message);
      toast.error(error.message);
      return;
    }

    toast.success("Welcome back!");
    navigate({ to: "/dashboard" });
  };

  const emailInputClass = `h-14 w-full rounded-xl border bg-surface pl-11 pr-3.5 text-sm outline-none transition duration-150 focus:ring-2 ${
    errors.email
      ? "border-destructive focus:border-destructive focus:ring-destructive/20"
      : "border-border focus:border-primary focus:ring-primary/20"
  }`;

  const passwordInputClass = `h-14 w-full rounded-xl border bg-surface pl-11 pr-12 text-sm outline-none transition duration-150 focus:ring-2 ${
    errors.password
      ? "border-destructive focus:border-destructive focus:ring-destructive/20"
      : "border-border focus:border-primary focus:ring-primary/20"
  }`;

  return (
    <div className="flex min-h-screen min-h-[100vh] w-screen overflow-hidden bg-card text-foreground">
      <div className="grid min-h-screen min-h-[100vh] w-full grid-cols-1 lg:grid-cols-[50%_50%]">
        <div className="flex min-h-[100vh] flex-col justify-center bg-card px-6 py-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20">
          <div className="mx-auto w-full max-w-[460px]">
            <Link to="/" className="inline-flex w-fit items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
                <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
              </div>
              <span className="flex flex-col">
                <span className="text-xl font-bold leading-none tracking-tight text-heading">
                  Care<span className="text-gradient-brand">Orbit</span>
                </span>
                <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Healthcare HRMS
                </span>
              </span>
            </Link>

            <div className="mt-10">
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-heading sm:text-[34px]">
                Welcome back
              </h1>
              <p className="mt-2 text-[15px] text-muted-foreground">
                Sign in to access your healthcare workforce workspace.
              </p>
            </div>

            <p className="mt-8 flex items-center gap-2 text-[13px] text-muted-foreground">
              <HeartPulse className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              Manage your healthcare workforce securely.
            </p>

            <form
              className="mt-4 space-y-5"
              autoComplete="on"
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                  Work email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="email"
                    name="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setErrors((current) => ({ ...current, email: undefined }));
                      setErrorMessage("");
                    }}
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    autoCorrect="off"
                    placeholder="Enter your work email"
                    aria-invalid={Boolean(errors.email)}
                    className={emailInputClass}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1.5 text-xs font-medium text-destructive">{errors.email}</p>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label htmlFor="password" className="text-sm font-medium">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <input
                    id="password"
                    name="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setErrors((current) => ({ ...current, password: undefined }));
                      setErrorMessage("");
                    }}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Enter your password"
                    aria-invalid={Boolean(errors.password)}
                    className={passwordInputClass}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-12 cursor-pointer items-center justify-center text-muted-foreground transition hover:text-foreground"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1.5 text-xs font-medium text-destructive">{errors.password}</p>
                )}
              </div>

              {errorMessage && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="h-14 w-full rounded-xl bg-gradient-brand text-sm font-semibold text-white shadow-sm transition duration-150 hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:ring-offset-2 active:opacity-90 disabled:opacity-50"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>

            <p className="mt-8 flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              Your organization&apos;s workforce data is protected with secure access controls.
            </p>

            <p className="mt-8 border-t border-border pt-6 text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                to="/signup"
                className="font-semibold text-primary underline-offset-4 hover:underline"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>

        <div className="hidden min-h-[100vh] items-center justify-center overflow-hidden bg-[#eef4fa] lg:flex">
          <img
            src="/healthcare-hrms-login-visual.png"
            alt="Healthcare HRMS workforce management"
            className="h-full w-full object-contain"
          />
        </div>
      </div>
    </div>
  );
}
