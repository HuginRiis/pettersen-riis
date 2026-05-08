import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export function PageShell({
  children,
  minimalHeader = false,
}: {
  children: React.ReactNode;
  minimalHeader?: boolean;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      {minimalHeader ? <MinimalHeader /> : <SiteHeader />}
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

function MinimalHeader() {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
      <div className="container mx-auto px-4 h-14 flex items-center justify-center">
        <Link
          to="/"
          aria-label="Hjem"
          title="Hjem"
          className="w-10 h-10 rounded-full border border-primary/40 flex items-center justify-center text-primary hover:shadow-[0_0_20px_var(--color-primary)] transition-shadow"
        >
          <Home size={18} />
        </Link>
      </div>
    </header>
  );
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  image,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  image: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative h-[42vh] min-h-[280px] w-full overflow-hidden border-b border-border">
      <img
        src={image}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="eager"
      />
      <div
        className="absolute inset-0"
        style={{ background: "var(--gradient-overlay)" }}
      />
      <div className="relative h-full container mx-auto px-4 flex flex-col justify-end pb-10">
        {eyebrow && (
          <div className="text-display text-xs md:text-sm tracking-[0.4em] text-primary uppercase mb-3">
            {eyebrow}
          </div>
        )}
        <h1 className="heading-hero text-3xl md:text-5xl">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-muted-foreground text-base md:text-lg">
            {subtitle}
          </p>
        )}
        {children && <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
}
