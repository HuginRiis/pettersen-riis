import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  image,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  image: string;
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
      </div>
    </section>
  );
}
