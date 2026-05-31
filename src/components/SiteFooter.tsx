import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-card/40">
      <div className="container mx-auto px-4 py-10 text-center">
        <Link
          to="/"
          aria-label="Hjem"
          title="Hjem"
          className="inline-flex items-center justify-center w-10 h-10 rounded-full border border-primary/40 text-primary hover:shadow-[0_0_20px_var(--color-primary)] transition-shadow mb-6"
        >
          <Home size={18} />
        </Link>
        <div className="ornate-divider mb-6">
          <span className="text-medieval text-lg">❦ House Pettersen Riis ❦</span>
        </div>
        <p className="text-display text-sm tracking-[0.3em] text-primary uppercase">
          Winter is coming
        </p>
        <p className="mt-3 text-xs text-muted-foreground tracking-wider">
          Skien · Norge · {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
