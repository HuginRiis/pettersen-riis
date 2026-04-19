import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Menu, X, LogOut, ChevronDown } from "lucide-react";
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

type NavLink = { to: RoutePath; label: string; icon?: string };
type NavGroup = { label: string; icon: string; description: string; links: NavLink[] };

const HOMEY_BACKED_ROUTES: RoutePath[] = ["/smarthus", "/var", "/steintavle"];

const groups: NavGroup[] = [
  {
    label: "Hverdag",
    icon: "📅",
    description:
      "Oversikt over dagen og omgivelsene — vær, luft og planer før du går ut døren.",
    links: [
      { to: "/agenda", label: "Agenda", icon: "📜" },
      { to: "/var", label: "Vær", icon: "🌨" },
      { to: "/pollen", label: "Pollen", icon: "🌾" },
      { to: "/vakttarnet", label: "Vakttårnet", icon: "👁" },
    ],
  },
  {
    label: "Eiendom",
    icon: "🏡",
    description:
      "Kontroll over hjem og eiendom — fra digital borg til kreative sysler og faste beskjeder.",
    links: [
      { to: "/hytta", label: "Hytta", icon: "🏔" },
      { to: "/smarthus", label: "Borgens Smarthus", icon: "🏰" },
      { to: "/oppussing-borgen", label: "Prosjekter på Borgen", icon: "🔨" },
      { to: "/oppussing-hytta", label: "Prosjekter på hytta", icon: "🪵" },
      { to: "/brodering", label: "Brodering", icon: "🧵" },
      { to: "/steintavle", label: "Steintavle", icon: "🪨" },
    ],
  },
  {
    label: "Dyr & Familie",
    icon: "🐾",
    description: "Alt som angår dine firbeinte følgesvenner — trivsel, aktivitet og omsorg.",
    links: [{ to: "/hundene", label: "Hundene", icon: "🐺" }],
  },
  {
    label: "Kropp",
    icon: "💪",
    description: "Styrke, utholdenhet og disiplin — her formes kroppen, dag for dag.",
    links: [{ to: "/trening", label: "Trening", icon: "⚔️" }],
  },
  {
    label: "Ferdsel",
    icon: "🚗",
    description: "Reisen gjennom riket — til fots, med kraft eller med maskin.",
    links: [
      { to: "/turer", label: "Ferden", icon: "🧭" },
      { to: "/jernhesten", label: "Jernhesten", icon: "⚡" },
      { to: "/ranger", label: "Ranger", icon: "🛡" },
    ],
  },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openMobileGroup, setOpenMobileGroup] = useState<string | null>(null);
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Lukk dropdown ved klikk utenfor
  useEffect(() => {
    if (!openGroup) return;
    const onDocClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenGroup(null);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [openGroup]);

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
            <div className="text-display text-sm tracking-[0.25em] text-primary">
              HOUSE PETTERSEN RIIS
            </div>
            <div className="text-[10px] text-muted-foreground tracking-widest">OF SKIEN</div>
          </div>
        </Link>

        <nav ref={navRef} className="hidden md:flex items-center gap-1">
          <Link
            to="/"
            className="px-3 py-2 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary transition-colors data-[status=active]:text-primary data-[status=active]:font-semibold"
            activeOptions={{ exact: true }}
          >
            Hjem
          </Link>

          {groups.map((g) => {
            const isOpen = openGroup === g.label;
            return (
              <div key={g.label} className="relative">
                <button
                  type="button"
                  onClick={() => setOpenGroup(isOpen ? null : g.label)}
                  className="px-3 py-2 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                  aria-expanded={isOpen}
                  aria-haspopup="menu"
                >
                  <span>{g.label}</span>
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-2 w-72 panel rounded-lg border border-border bg-card/95 backdrop-blur shadow-lg p-3 z-50"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{g.icon}</span>
                      <span className="text-[10px] tracking-[0.3em] uppercase text-primary">
                        {g.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground italic mb-3 leading-snug">
                      {g.description}
                    </p>
                    <ul className="flex flex-col">
                      {g.links.map((l) => (
                        <li key={l.to}>
                          <Link
                            to={l.to}
                            preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                            onClick={() => setOpenGroup(null)}
                            className="flex items-center gap-2 px-2 py-2 rounded text-sm tracking-wider uppercase text-muted-foreground hover:text-primary hover:bg-primary/5 data-[status=active]:text-primary data-[status=active]:font-semibold"
                          >
                            {l.icon && <span className="text-base">{l.icon}</span>}
                            <span>{l.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}

          <button
            onClick={handleLogout}
            className="ml-2 px-3 py-2 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
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
            <Link
              to="/"
              onClick={() => setOpen(false)}
              className="px-2 py-3 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary border-b border-border data-[status=active]:text-primary"
              activeOptions={{ exact: true }}
            >
              Hjem
            </Link>

            {groups.map((g) => {
              const isOpen = openMobileGroup === g.label;
              return (
                <div key={g.label} className="border-b border-border last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenMobileGroup(isOpen ? null : g.label)}
                    className="w-full px-2 py-3 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary flex items-center justify-between"
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-2">
                      <span>{g.icon}</span>
                      <span>{g.label}</span>
                    </span>
                    <ChevronDown
                      size={14}
                      className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {isOpen && (
                    <ul className="pb-2 pl-6 flex flex-col">
                      {g.links.map((l) => (
                        <li key={l.to}>
                          <Link
                            to={l.to}
                            preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                            onClick={() => {
                              setOpen(false);
                              setOpenMobileGroup(null);
                            }}
                            className="flex items-center gap-2 px-2 py-2 text-sm tracking-wider uppercase text-muted-foreground hover:text-primary data-[status=active]:text-primary"
                          >
                            {l.icon && <span>{l.icon}</span>}
                            <span>{l.label}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}

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
