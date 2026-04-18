import { Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { logoutFn } from "@/server/auth";

const links = [
  { to: "/", label: "Hjem" },
  { to: "/agenda", label: "Agenda" },
  { to: "/var", label: "Vær" },
  { to: "/pollen", label: "Pollen" },
  { to: "/hytta", label: "Hytta" },
  { to: "/hundene", label: "Hundene" },
  { to: "/trening", label: "Trening" },
  { to: "/turer", label: "Ferden" },
  { to: "/jernhesten", label: "Jernhesten" },
  { to: "/smarthus", label: "Borgens Smarthus" },
  { to: "/brodering", label: "Brodering" },
  { to: "/steintavle", label: "Steintavle" },
] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playGotTheme = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio("/audio/got-theme.mp3");
        audioRef.current.volume = 0.35;
      }
      const a = audioRef.current;
      a.pause();
      a.currentTime = 0;
      void a.play().catch(() => {
        /* autoplay/user-gesture issues silently ignored */
      });
    } catch {
      /* no-op */
    }
  };

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
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" onClick={playGotTheme} className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center text-primary font-display text-lg group-hover:shadow-[0_0_20px_var(--color-primary)] transition-shadow">
            ❦
          </div>
          <div className="leading-tight">
            <div className="text-display text-sm tracking-[0.25em] text-primary">HOUSE PETTERSEN RIIS</div>
            <div className="text-[10px] text-muted-foreground tracking-widest">OF SKIEN</div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={l.to === "/" ? playGotTheme : undefined}
              className="px-3 py-2 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary transition-colors data-[status=active]:text-primary data-[status=active]:font-semibold"
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="ml-2 px-3 py-2 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            aria-label="Logg ut"
            title="Logg ut"
          >
            <LogOut size={14} />
          </button>
        </nav>

        <button className="md:hidden text-primary p-2" onClick={() => setOpen((v) => !v)} aria-label="Meny">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="md:hidden border-t border-border bg-card/95 backdrop-blur">
          <div className="container mx-auto px-4 py-2 flex flex-col">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={() => {
                  setOpen(false);
                  if (l.to === "/") playGotTheme();
                }}
                className="px-2 py-3 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary border-b border-border last:border-0 data-[status=active]:text-primary"
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            ))}
            <button
              onClick={() => {
                setOpen(false);
                handleLogout();
              }}
              className="px-2 py-3 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary text-left flex items-center gap-2"
            >
              <LogOut size={14} /> Logg ut
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}
