import { Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X, LogOut, Crown, Swords, Shield } from "lucide-react";
import { logoutFn } from "@/server/auth";

type RoutePath =
  | "/"
  | "/agenda"
  | "/var"
  | "/pollen"
  | "/vakttarnet"
  | "/hytta"
  | "/hundene"
  | "/trening"
  | "/turer"
  | "/jernhesten"
  | "/ranger"
  | "/varsler"
  | "/smarthus"
  | "/brodering"
  | "/steintavle"
  | "/oppussing-borgen"
  | "/oppussing-hytta";

type NavLink = { to: RoutePath; label: string };

const HOMEY_BACKED_ROUTES: RoutePath[] = ["/smarthus", "/var", "/steintavle"];

const navLinks: NavLink[] = [
  { to: "/", label: "Hjem" },
  { to: "/agenda", label: "Agenda" },
  { to: "/var", label: "Vær" },
  { to: "/pollen", label: "Pollen" },
  { to: "/vakttarnet", label: "Vakttårnet" },
  { to: "/hytta", label: "Hytta" },
  { to: "/smarthus", label: "Smartborg" },
  { to: "/oppussing-borgen", label: "Prosjekter på Borgen" },
  { to: "/oppussing-hytta", label: "Prosjekter på hytta" },
  { to: "/hundene", label: "Hundene" },
  { to: "/trening", label: "Trening" },
  { to: "/turer", label: "Ferden" },
  { to: "/varsler", label: "Farevarsler" },
  { to: "/jernhesten", label: "Jernhesten" },
  { to: "/ranger", label: "Ranger" },
  { to: "/steintavle", label: "Steintavle" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logoutFn();
    } finally {
      await router.invalidate();
      router.navigate({ to: "/login" });
    }
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center text-primary font-display text-lg group-hover:shadow-[0_0_20px_var(--color-primary)] transition-shadow">
            ❦
          </div>
          <div className="leading-tight">
            <div className="text-display text-sm tracking-[0.25em] text-primary flex items-center gap-1.5">
              <Crown size={12} className="text-primary/80" />
              <span>HOUSE PETTERSEN RIIS</span>
              <Swords size={12} className="text-primary/80" />
            </div>
            <div className="text-[10px] text-muted-foreground tracking-widest flex items-center gap-1.5">
              <Shield size={9} className="text-muted-foreground/70" />
              <span>OF SKIEN</span>
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex flex-1 flex-wrap items-center justify-start gap-x-3 gap-y-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
              activeOptions={l.to === "/" ? { exact: true } : undefined}
              className="text-xs tracking-wider uppercase text-muted-foreground hover:text-primary transition-colors data-[status=active]:text-primary data-[status=active]:font-semibold"
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="ml-1 text-muted-foreground hover:text-primary transition-colors"
            aria-label="Logg ut"
            title="Logg ut"
          >
            <LogOut size={14} />
          </button>
        </nav>

        <button
          className="md:hidden text-primary p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Meny"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-border bg-card/95 backdrop-blur">
          <div className="container mx-auto px-4 py-2 flex flex-col">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                activeOptions={l.to === "/" ? { exact: true } : undefined}
                onClick={() => setOpen(false)}
                className="px-2 py-2.5 text-xs tracking-wider uppercase text-muted-foreground hover:text-primary border-b border-border last:border-0 data-[status=active]:text-primary data-[status=active]:font-semibold"
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                handleLogout();
              }}
              className="px-2 py-3 text-xs tracking-wider uppercase text-muted-foreground hover:text-primary text-left flex items-center gap-2"
            >
              <LogOut size={14} /> Logg ut
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
