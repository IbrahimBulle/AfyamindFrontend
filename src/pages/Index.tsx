import { ArrowRight, HeartPulse, MessageSquareHeart, ShieldPlus, Stethoscope } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const featureCards = [
  {
    title: "Flexible screening",
    description: "Choose only the check-in tests that fit today, save your progress, and come back with a clearer care plan.",
    icon: HeartPulse,
  },
  {
    title: "Local AI support",
    description: "AfyaMind is configured to use local Ollama for grounded, privacy-aware wellness conversations on this machine.",
    icon: ShieldPlus,
  },
  {
    title: "Appointment follow-up",
    description: "Book a session, trigger Africa's Talking SMS reminders, and keep your support network aligned.",
    icon: MessageSquareHeart,
  },
];

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground animate-pulse font-serif text-xl">AfyaMind</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(194,238,210,0.92),transparent_32%),radial-gradient(circle_at_top_right,rgba(231,247,221,0.85),transparent_26%),linear-gradient(180deg,rgba(247,252,248,1),rgba(226,244,232,1))]" />

      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-4 rounded-[2rem] border border-white/60 bg-white/50 px-6 py-5 backdrop-blur-2xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">AfyaMind</div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Mental wellness support built for local care, early detection, and consistent follow-up.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-full px-5">
              <Link to="/login">Sign In</Link>
            </Button>
            <Button asChild className="rounded-full px-5">
              <Link to="/register">
                Create Account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr,0.85fr]">
          <div className="card-elevated p-8 sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/75 px-4 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              SDG 3 • Good Health And Well-Being
            </div>

            <h1 className="mt-6 max-w-3xl text-5xl tracking-tight text-foreground sm:text-6xl">
              Mental health support that feels local, human, and ready now.
            </h1>

            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">
              Mental health challenges have become a pandemic not only nationally but also locally, and communities
              need tools that help people check in earlier, respond faster, and stay connected to care.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <div className="glass-surface rounded-[1.6rem] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Focus</div>
                <div className="mt-2 text-lg font-medium">Early support</div>
                <p className="mt-2 text-sm text-muted-foreground">Catch risk earlier with guided tests and quick context notes.</p>
              </div>
              <div className="glass-surface rounded-[1.6rem] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Care path</div>
                <div className="mt-2 text-lg font-medium">Local follow-up</div>
                <p className="mt-2 text-sm text-muted-foreground">Move from check-in to CHW support, appointments, and reminders.</p>
              </div>
              <div className="glass-surface rounded-[1.6rem] px-4 py-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Mission</div>
                <div className="mt-2 text-lg font-medium">Well-being access</div>
                <p className="mt-2 text-sm text-muted-foreground">Support SDG 3 with care that feels practical in everyday life.</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="glass-surface rounded-[2rem] p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Stethoscope className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-2xl tracking-tight">Why AfyaMind</h2>
                  <p className="mt-1 text-sm text-muted-foreground">A care experience designed for people, CHWs, and local follow-up teams.</p>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                <div className="rounded-[1.5rem] border border-white/60 bg-white/70 px-4 py-4 text-sm text-muted-foreground">
                  A visible check-in flow that turns complex mental health screening into smaller, approachable steps.
                </div>
                <div className="rounded-[1.5rem] border border-white/60 bg-white/70 px-4 py-4 text-sm text-muted-foreground">
                  A local AI companion that can guide reflection while keeping the experience grounded in the care plan.
                </div>
                <div className="rounded-[1.5rem] border border-white/60 bg-white/70 px-4 py-4 text-sm text-muted-foreground">
                  Appointment booking and Africa&apos;s Talking SMS support to keep care from slipping through the cracks.
                </div>
              </div>
            </div>

            <div className="card-elevated p-6">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Start here</div>
              <p className="mt-3 text-lg leading-7 text-foreground">
                Create an account to begin your first check-in, explore guided support, and build a stronger path to health and well-being.
              </p>
              <Button asChild className="mt-5 h-12 rounded-2xl px-6">
                <Link to="/register">
                  Begin your first check-in
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {featureCards.map(({ title, description, icon: Icon }) => (
            <div key={title} className="glass-surface rounded-[2rem] p-6">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/75 text-primary shadow-[0_12px_24px_rgba(61,121,89,0.12)]">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-2xl tracking-tight">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
