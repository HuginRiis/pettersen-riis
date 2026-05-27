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
  compact = false,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  image: string;
  children?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      className={`relative w-full overflow-hidden border-b border-border ${
        compact ? "h-[31vh] min-h-[210px]" : "h-[42vh] min-h-[280px]"
      }`}
    >
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
      {/* Dobbel-tapp øverst på bildet → scroll til topp */}
      <DoubleTapToTop />
      <div className={`relative h-full container mx-auto px-4 flex flex-col justify-end ${compact ? "pb-6" : "pb-10"}`}>
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

/**
 * Usynlig "hot zone" øverst i hero — dobbel-tapp/dobbel-klikk scroller helt til topp.
 * Plasseres absolutt slik at den ikke stjeler vanlig scroll/tap fra resten.
 */
export function DoubleTapToTop({ className }: { className?: string }) {
  const lastTap = (typeof window !== "undefined" ? (window as any) : ({} as any));
  const handle = () => {
    const now = Date.now();
    const prev = lastTap.__heroLastTap ?? 0;
    if (now - prev < 350) {
      try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
      lastTap.__heroLastTap = 0;
      return;
    }
    lastTap.__heroLastTap = now;
  };
  return (
    <button
      type="button"
      aria-label="Dobbel-tapp for å scrolle til topp"
      onClick={handle}
      onDoubleClick={() => { try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); } }}
      className={`absolute top-0 left-0 right-0 h-16 z-20 bg-transparent ${className ?? ""}`}
      style={{ WebkitTapHighlightColor: "transparent" }}
    />
  );
}
