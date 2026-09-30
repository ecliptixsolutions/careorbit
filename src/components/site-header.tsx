import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-surface/95 backdrop-blur-md">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
            <Activity className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xl font-bold tracking-tight text-heading">
            Care<span className="text-gradient-brand">Orbit</span>
          </span>
        </Link>
        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="/#features"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Features
          </a>
          <a
            href="/#why-us"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Why Choose Us
          </a>
          <a
            href="/#contact"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Contact
          </a>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild size="sm">
              <Link to="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="bg-gradient-brand text-white shadow-glow hover:opacity-95"
              >
                <Link to="/signup">Book now</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
