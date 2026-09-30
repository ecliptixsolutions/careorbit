import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  BedDouble,
  Stethoscope,
  FlaskConical,
  Pill,
  Receipt,
  Boxes,
  Scissors,
  Video,
  Bot,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Activity,
  ScanLine,
} from "lucide-react";
import heroImg from "@/assets/hero-doctor.jpg";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/site-header";

export const Route = createFileRoute("/")({
  component: Index,
});

const features = [
  {
    icon: Users,
    title: "Patient Management",
    desc: "Complete demographics, history & EMR in one record.",
  },
  {
    icon: BedDouble,
    title: "IPD / OPD Management",
    desc: "Streamline ward, admission and outpatient flows.",
  },
  {
    icon: Stethoscope,
    title: "Medical Staff",
    desc: "Doctors, nurses, schedules, roles and permissions.",
  },
  {
    icon: Sparkles,
    title: "Quick Consultations",
    desc: "Fast, structured consults with smart templates.",
  },
  { icon: Bot, title: "AI & Voice Consultation", desc: "AI assistant + voice receptionist 24/7." },
  { icon: FlaskConical, title: "Lab Management", desc: "Orders, samples, results and reporting." },
  { icon: Pill, title: "Pharmacy", desc: "Dispense, stock and prescriptions, integrated." },
  {
    icon: Receipt,
    title: "Billing & Accounting",
    desc: "Invoices, claims, taxes and revenue insight.",
  },
  { icon: Boxes, title: "Inventory", desc: "Track consumables, equipment & expiry." },
  { icon: Scissors, title: "Surgery", desc: "OT scheduling, checklists and post-op." },
  { icon: ScanLine, title: "Radiology & DICOM", desc: "Imaging workflows and DICOM viewer." },
  { icon: Video, title: "Telemedicine", desc: "Secure video consults with prescriptions." },
];

const stats = [
  { v: "875+", l: "Healthcare Facilities" },
  { v: "1M+", l: "Patients Served" },
  { v: "30+", l: "Countries" },
  { v: "99.9%", l: "Uptime SLA" },
];

const whyChoose = [
  {
    icon: ShieldCheck,
    title: "Trusted access controls",
    desc: "Role-based workflows keep clinical, billing and admin work organized.",
  },
  {
    icon: Activity,
    title: "Faster care coordination",
    desc: "Patient context, appointments and operational data stay connected.",
  },
  {
    icon: Stethoscope,
    title: "Built for healthcare teams",
    desc: "Designed around doctors, front desk staff, pharmacy, lab and management.",
  },
  {
    icon: Bot,
    title: "AI-ready operations",
    desc: "Structured clinical data prepares facilities for assisted consultations.",
  },
];

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-hero">
        <div className="container relative mx-auto grid gap-12 px-4 py-16 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col justify-center">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border bg-surface px-3 py-1 text-xs font-medium text-heading shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-brand-red" />
              Top Hospital Management Software
            </div>
            <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-heading md:text-6xl">
              An Intuitive Healthcare Solution that is a combination of{" "}
              <span className="text-gradient-brand">ERP + EMR + AI</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg text-muted-foreground">
              Run your clinic or hospital end-to-end — patients, appointments, lab, pharmacy,
              billing and AI-assisted consultations, all in one place.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button
                asChild
                size="lg"
                className="bg-gradient-brand text-white shadow-glow hover:opacity-95"
              >
                <Link to="/signup">
                  Book a demo <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href="#features">Explore features</a>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-blue" /> HIPAA-aware
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-brand-red" /> Real-time
              </div>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 rounded-[28px] bg-gradient-brand opacity-15 blur-3xl" />
            <img
              src={heroImg}
              alt="Doctor using CareOrbit on a tablet"
              width={1280}
              height={1280}
              className="relative aspect-square w-full rounded-[28px] border bg-surface object-cover shadow-elegant"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-4 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
            All-in-one platform
          </div>
          <h2 className="mt-4 text-3xl font-bold text-heading md:text-4xl">
            Everything your facility needs
          </h2>
          <p className="mt-3 text-muted-foreground">
            Twelve integrated modules designed for clinics and hospitals of every size.
          </p>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="group relative overflow-hidden rounded-[18px] border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-heading">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Why Choose Us */}
      <section id="why-us" className="border-y bg-surface">
        <div className="container mx-auto px-4 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border bg-secondary-soft px-3 py-1 text-xs font-medium text-secondary">
              Proven healthcare platform
            </div>
            <h2 className="mt-4 text-3xl font-bold text-heading md:text-4xl">Why Choose Us</h2>
            <p className="mt-3 text-muted-foreground">
              A focused operating system for better trust, speed and care-team visibility.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.l}
                className="rounded-[18px] border bg-background p-5 text-center shadow-sm"
              >
                <div className="text-3xl font-bold text-gradient-brand md:text-4xl">{s.v}</div>
                <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {s.l}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {whyChoose.map((item) => (
              <div key={item.title} className="rounded-[18px] border bg-card p-5 shadow-sm">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-heading">{item.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="contact" className="container mx-auto px-4 pb-20">
        <div className="overflow-hidden rounded-[28px] bg-gradient-brand p-10 text-center text-white shadow-elegant md:p-16">
          <h2 className="text-3xl font-bold md:text-4xl">Ready to modernize your clinic?</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/90">
            Get started with CareOrbit today and bring your patient care, operations and AI
            together.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="bg-white text-heading hover:bg-white/90"
            >
              <Link to="/signup">Create your account</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-white/10 text-white hover:bg-white/20"
            >
              <Link to="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="container mx-auto flex flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground md:flex-row">
          <div>© {new Date().getFullYear()} CareOrbit. All rights reserved.</div>
          <div className="flex gap-4">
            <span>www.careorbit.in</span>
            <span>sales@careorbit.in</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
