import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  | "/smarthus"
  | "/brodering"
  | "/steintavle"
  | "/oppussing-borgen"
  | "/oppussing-hytta";

type NavLink = { to: RoutePath; label: string; icon: string };

const HOMEY_BACKED_ROUTES: RoutePath[] = ["/smarthus", "/var", "/steintavle"];

const navLinks: NavLink[] = [
  { to: "/agenda", label: "Agenda", icon: "📜" },
  { to: "/var", label: "Vær", icon: "🌨" },
  { to: "/pollen", label: "Pollen", icon: "🌾" },
  { to: "/vakttarnet", label: "Vakttårnet", icon: "👁" },
  { to: "/hytta", label: "Hytta", icon: "🏔" },
  { to: "/smarthus", label: "Smarthus", icon: "🏰" },
  { to: "/oppussing-borgen", label: "Borgen", icon: "🔨" },
  { to: "/oppussing-hytta", label: "Hytte-pros.", icon: "🪵" },
  { to: "/brodering", label: "Brodering", icon: "🧵" },
  { to: "/steintavle", label: "Steintavle", icon: "🪨" },
  { to: "/hundene", label: "Hundene", icon: "🐺" },
  { to: "/trening", label: "Trening", icon: "⚔️" },
  { to: "/turer", label: "Ferden", icon: "🧭" },
  { to: "/jernhesten", label: "Jernhesten", icon: "⚡" },
  { to: "/ranger", label: "Ranger", icon: "🛡" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  const pickSoundForHour = (hour: number): string => {
    if (hour >= 6 && hour < 15) return "/audio/birds.mp3";
    if (hour >= 15 && hour < 20) return "/audio/war.mp3";
    return "/audio/owl.mp3";
  };

  const playGotTheme = () => {
    try {
      const src = pickSoundForHour(new Date().getHours());
      if (!audioRef.current || audioRef.current.src.indexOf(src) === -1) {
        audioRef.current = new Audio(src);
        audioRef.current.volume = 0.45;
      }
      const a = audioRef.current;
      a.pause();
      a.currentTime = 0;
      void a.play().catch(() => {});
    } catch {
      /* no-op */
    }
  };

  // Suppress unused warning — kept for future use
  void playGotTheme;

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
      <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
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

        <nav className="hidden lg:flex items-center gap-1.5 flex-wrap justify-end">
          <Link
            to="/"
            className="got-tab data-[status=active]:got-tab-active"
            activeOptions={{ exact: true }}
          >
            <span className="text-base leading-none">❦</span>
            <span>Hjem</span>
          </Link>

          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
              className="got-tab data-[status=active]:got-tab-active"
            >
              <span className="text-base leading-none">{l.icon}</span>
              <span>{l.label}</span>
            </Link>
          ))}

          <button
            onClick={handleLogout}
            className="got-tab"
            aria-label="Logg ut"
            title="Logg ut"
          >
            <LogOut size={12} />
          </button>
        </nav>

        <button
          className="lg:hidden text-primary p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Meny"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="lg:hidden border-t border-border bg-card/95 backdrop-blur">
          <div className="container mx-auto px-4 py-4 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="got-tab justify-center data-[status=active]:got-tab-active"
              activeOptions={{ exact: true }}
            >
              <span className="text-base leading-none">❦</span>
              <span>Hjem</span>
            </Link>

            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                onClick={() => setOpen(false)}
                className="got-tab justify-center data-[status=active]:got-tab-active"
              >
                <span className="text-base leading-none">{l.icon}</span>
                <span>{l.label}</span>
              </Link>
            ))}

            <button
              onClick={() => {
                setOpen(false);
                handleLogout();
              }}
              className="got-tab justify-center"
            >
              <LogOut size={12} />
              <span>Logg ut</span>
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
