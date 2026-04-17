export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-card/40">
      <div className="container mx-auto px-4 py-10 text-center">
        <div className="ornate-divider mb-6">
          <span className="text-medieval text-lg">❦ House Riis Pettersen ❦</span>
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
