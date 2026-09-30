import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";
import { isValidEmail } from "@/lib/password-security";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

const genericMessage =
  "If an account exists for that email, a secure password-reset link has been sent.";

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [devUrl, setDevUrl] = useState<string | null>(null);

  const submit = async () => {
    if (!isValidEmail(email)) {
      toast.error("Enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg =
          response.status === 429
            ? "Too many reset attempts. Please wait before trying again."
            : body.error?.message || "Reset request failed";
        toast.error(msg);
        return;
      }

      // Development only: server returns the link when SMTP is not configured
      if (body.dev_reset_url) setDevUrl(body.dev_reset_url);

      setSubmitted(true);
      toast.success(genericMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-12 text-foreground">
      <section className="mx-auto max-w-md rounded-[18px] border bg-card p-6 shadow-sm">
        <Link to="/login" className="inline-flex items-center text-sm text-primary">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to sign in
        </Link>
        <Mail className="mt-6 h-9 w-9 text-primary" />
        <h1 className="mt-3 text-2xl font-semibold text-heading">Reset your password</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the email address used for your CareOrbit account.
        </p>

        {submitted ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border bg-muted/60 p-4 text-sm">{genericMessage}</div>
            {devUrl && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
                <strong>Development mode — SMTP not configured.</strong>
                <br />
                Reset link (use this to test):
                <br />
                <a href={devUrl} className="mt-1 block break-all underline">
                  {devUrl}
                </a>
              </div>
            )}
          </div>
        ) : (
          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div>
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
