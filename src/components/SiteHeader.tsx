import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X, LogOut, Crown, Swords, Shield, KeyRound, Home } from "lucide-react";
import { logoutFn } from "@/server/auth";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { openLoginDialog } from "@/components/LoginDialog";
import { useUvSun, uvLevel } from "@/hooks/use-uv-sun";
import { getNameForCurrentIp } from "@/server/user-locations";
import { useNavUsage } from "@/hooks/use-nav-usage";
import { getNetatmoWeatherStation } from "@/server/netatmo-weather";
import { useLastGood } from "@/hooks/use-last-good";

const BORGEN_COORD = { lat: 59.1789, lon: 9.5732 };
const HYTTA_COORD = { lat: 59.8733, lon: 9.4297 };

type RoutePath =
  | "/"
  | "/agenda"
  | "/push-varslinger"
  | "/var"
  | "/pollen"
  | "/vakttarnet"
  | "/hytta"
  | "/hundene"
  | "/trening"
  | "/turer"
  | "/stromkroniken"
  | "/varsler"
  | "/smarthus"
  | "/steintavle"
  | "/oppussing-borgen"
  | "/oppussing-hytta"
  | "/matvarer"
  | "/kvitteringer"
  | "/got-saga";

type NavLink = { to: RoutePath; label: string; public?: boolean };

const HOMEY_BACKED_ROUTES: RoutePath[] = ["/smarthus", "/var", "/steintavle"];

// Hjem skal alltid stå først, og Steintavle alltid sist — uavhengig av bruksstatistikk.
const ALWAYS_FIRST: RoutePath = "/";
const ALWAYS_LAST: RoutePath = "/steintavle";

// Public halls — open to any visitor entering the courtyard.
// Other halls only appear after the portal is opened (login).
const navLinks: NavLink[] = [
  { to: "/", label: "Hjem", public: true },
  { to: "/var", label: "Vær", public: true },
  { to: "/pollen", label: "Pollen", public: true },
  { to: "/turer", label: "Ferden", public: true },
  { to: "/got-saga", label: "Westeros", public: true },
  { to: "/agenda", label: "Agenda" },
  { to: "/push-varslinger", label: "Varslinger" },
  { to: "/vakttarnet", label: "Vakttårnet" },
  { to: "/hytta", label: "Hytta", public: true },
  { to: "/smarthus", label: "Smartborg" },
  { to: "/stromkroniken", label: "Strømkrøniken" },
  { to: "/oppussing-borgen", label: "Prosjekter på Borgen" },
  { to: "/oppussing-hytta", label: "Prosjekter på hytta" },
  { to: "/matvarer", label: "Varer" },
  { to: "/kvitteringer", label: "Kvitteringer" },
  { to: "/hundene", label: "Hundene" },
  { to: "/trening", label: "Trening" },
  { to: "/varsler", label: "Farevarsler", public: true },
  { to: "/steintavle", label: "Steintavle" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { authenticated } = useAuthStatus();
  const isAuthed = authenticated === true;

  // Hent hvilken bruker IP-en tilhører (Arne / Rebekka / …) for å scope tellinger.
  const fetchName = useServerFn(getNameForCurrentIp);
  const [who, setWho] = useState<string>("anon");
  useEffect(() => {
    if (!isAuthed) {
      setWho("anon");
      return;
    }
    let cancelled = false;
    fetchName()
      .then((r) => {
        if (!cancelled && r?.who) setWho(r.who);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthed, fetchName]);

  const { usage, bump } = useNavUsage(who);

  // Visitors outside the gate only see public halls; authed users see everything.
  const baseLinks = isAuthed ? navLinks : navLinks.filter((l) => l.public);

  // Sorter: Hjem alltid først, Steintavle alltid sist, resten etter bruksfrekvens.
  const sortedLinks = (() => {
    const first = baseLinks.filter((l) => l.to === ALWAYS_FIRST);
    const last = baseLinks.filter((l) => l.to === ALWAYS_LAST);
    const rest = baseLinks.filter((l) => l.to !== ALWAYS_LAST && l.to !== ALWAYS_FIRST);
    const indexed = rest.map((l, i) => ({ link: l, i, count: usage[l.to] ?? 0 }));
    indexed.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.i - b.i;
    });
    return [...first, ...indexed.map((x) => x.link), ...last];
  })();

  const handleLogout = async () => {
    try {
      await logoutFn();
    } finally {
      if (typeof window !== "undefined") {
        window.location.href = "/";
      } else {
        await router.invalidate();
        router.navigate({ to: "/" });
      }
    }
  };

  const handleLogin = () => {
    openLoginDialog();
  };

  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-3 group shrink-0">
          <div className="w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center text-primary group-hover:shadow-[0_0_20px_var(--color-primary)] transition-shadow">
            <Home size={16} />
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

        <nav className="hidden xl:flex flex-1 flex-wrap items-center justify-start gap-x-2 gap-y-2">
          {sortedLinks.map((l) => {
            const count = usage[l.to] ?? 0;
            return (
              <Link
                key={l.to}
                to={l.to}
                preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                activeOptions={l.to === "/" ? { exact: true } : undefined}
                onClick={() => bump(l.to)}
                className="got-nav-btn inline-flex items-center gap-1.5"
              >
                <span>{l.label}</span>
                {count > 0 && <UsageBadge count={count} />}
                {l.to === "/" && <UvBadge lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
                {l.to === "/hytta" && <UvBadge lat={HYTTA_COORD.lat} lon={HYTTA_COORD.lon} />}
              </Link>
            );
          })}
          {isAuthed ? (
            <button
              onClick={handleLogout}
              className="ml-1 text-muted-foreground hover:text-primary transition-colors"
              aria-label="Logg ut"
              title="Steng porten"
            >
              <LogOut size={14} />
            </button>
          ) : (
            <button
              onClick={handleLogin}
              className="ml-1 text-primary hover:text-gold transition-colors flex items-center gap-1.5 text-xs tracking-[0.25em] uppercase"
              aria-label="Tre inn i borgen"
              title="Tre inn i borgen"
            >
              <KeyRound size={14} />
              <span className="hidden lg:inline">Tre inn</span>
            </button>
          )}
        </nav>

        <button
          className="xl:hidden text-primary p-2"
          onClick={() => setOpen((v) => !v)}
          aria-label="Meny"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="xl:hidden border-t border-border bg-card/95 backdrop-blur">
          <div className="container mx-auto px-4 py-2 flex flex-col">
            {sortedLinks.map((l) => {
              const count = usage[l.to] ?? 0;
              return (
                <Link
                  key={l.to}
                  to={l.to}
                  preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                  activeOptions={l.to === "/" ? { exact: true } : undefined}
                  onClick={() => {
                    bump(l.to);
                    setOpen(false);
                  }}
                  className="px-2 py-2.5 text-xs tracking-wider uppercase text-muted-foreground hover:text-primary border-b border-border last:border-0 data-[status=active]:text-primary data-[status=active]:font-semibold flex items-center gap-2"
                >
                  <span className="flex-1">{l.label}</span>
                  {count > 0 && <UsageBadge count={count} />}
                  {l.to === "/" && <UvBadge lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
                  {l.to === "/hytta" && <UvBadge lat={HYTTA_COORD.lat} lon={HYTTA_COORD.lon} />}
                </Link>
              );
            })}
            {isAuthed ? (
              <button
                onClick={() => {
                  setOpen(false);
                  handleLogout();
                }}
                className="px-2 py-3 text-xs tracking-wider uppercase text-muted-foreground hover:text-primary text-left flex items-center gap-2"
              >
                <LogOut size={14} /> Steng porten
              </button>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  handleLogin();
                }}
                className="px-2 py-3 text-xs tracking-wider uppercase text-primary hover:text-gold text-left flex items-center gap-2"
              >
                <KeyRound size={14} /> Tre inn i borgen
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}

function UsageBadge({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[9px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px] bg-muted/40 text-muted-foreground border border-border"
      title={`Brukt ${count} ganger`}
    >
      {count}
    </span>
  );
}

function UvBadge({ lat, lon }: { lat: number; lon: number }) {
  const { uvNow } = useUvSun(lat, lon);
  if (uvNow == null) return null;
  const lvl = uvLevel(uvNow);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[9px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px]"
      style={{
        background: `color-mix(in oklab, ${lvl.color} 22%, transparent)`,
        color: lvl.color,
        border: `1px solid color-mix(in oklab, ${lvl.color} 50%, transparent)`,
      }}
      title={`UV nå: ${uvNow.toFixed(1)} (${lvl.label})`}
    >
      UV {Math.round(uvNow)}
    </span>
  );
}
