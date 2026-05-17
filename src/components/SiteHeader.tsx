import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X, LogOut, Crown, Swords, Shield, KeyRound, Home, Star, Flower2,
  Sun, Compass, Castle, CalendarDays, BellRing, Eye, Mountain, Lightbulb, Lamp, Zap, Hammer,
  ShoppingCart, Receipt, Dog, Dumbbell, AlertTriangle, ScrollText, Globe, ChevronDown, ChevronRight,
  TreePine, Coins, Bot, Wallet, Volume2 } from "lucide-react";

import { logoutFn } from "@/server/auth";
import { getIcon as getWebFavIcon, getIconColor as getWebFavIconColor, faviconUrl, FAVICON_ICON } from "@/lib/web-favorite-icons";
import birchImg from "@/assets/pollen-birch.png";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { openLoginDialog } from "@/components/LoginDialog";
import { useUvSun, uvLevel } from "@/hooks/use-uv-sun";
import { getNameForCurrentIp, getDefaultLocation } from "@/server/user-locations";
import { useNavUsage } from "@/hooks/use-nav-usage";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { getNetatmoWeatherStation } from "@/server/netatmo-weather";
import { useLastGood } from "@/hooks/use-last-good";
import { PushTodayBadge, LightsOnBadge, WeatherDaysBadge, AlarmStateBadge, AlertsSeverityBadge, PowerVsYesterdayBadge, TrainingLast4WeeksBadge, UtgangsdorenLockBadge, StepsTodayBadge, MowerStatusBadge, CurrentTempBadge, GarbageNextPickupBadge, GardenaStatusBadge, GardenaBatteryBadge, GardenaSignalBadge, RoborockStatusBadge, BudgetRemainingBadge, OkonomiBruktBadge, OkonomiInntektBadge, OkonomiBudsjettBadge, OkonomiOverskuddBadge, OkonomiSnittPrDagBadge, OkonomiIgjenPrDagBadge } from "@/components/HallBadges";
import { useHeaderBadgeSettings, isBadgeVisible } from "@/hooks/use-header-badge-settings";
import { useMenuVisibility, isMenuLinkVisible } from "@/hooks/use-menu-visibility";

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
  | "/lys"
  | "/steintavle"
  | "/oppussing-borgen"
  | "/oppussing-hytta"
  | "/matvarer"
  | "/kvitteringer"
  | "/okonomi"
  | "/skatte-utregningen"
  | "/gressklipper"
  | "/stovsugeren"
  | "/got-saga";

type NavLink = { to: RoutePath; label: string; public?: boolean };

const HOMEY_BACKED_ROUTES: RoutePath[] = ["/smarthus", "/var", "/steintavle"];

// Hjem skal alltid stå først, og Steintavle alltid sist — uavhengig av bruksstatistikk.
const ALWAYS_FIRST: RoutePath = "/";
const ALWAYS_LAST: RoutePath = "/steintavle";

// Ikon for hver menyside (pollen håndteres separat med PollenIcon)
const ROUTE_ICON: Partial<Record<RoutePath, React.ComponentType<{ size?: number; className?: string; color?: string; fill?: string; strokeWidth?: number }>>> = {
  "/": Home,
  "/var": Sun,
  "/turer": Compass,
  "/got-saga": Castle,
  "/agenda": CalendarDays,
  "/push-varslinger": BellRing,
  "/vakttarnet": Eye,
  "/hytta": Mountain,
  "/smarthus": Lightbulb,
  "/lys": Lamp,
  "/stromkroniken": Zap,
  "/oppussing-borgen": Hammer,
  "/oppussing-hytta": Hammer,
  "/matvarer": ShoppingCart,
  "/kvitteringer": Receipt,
  "/okonomi": Wallet,
  "/hundene": Dog,
  "/trening": Dumbbell,
  "/varsler": AlertTriangle,
  "/steintavle": ScrollText,
  "/skatte-utregningen": Coins,
  "/gressklipper": Bot,
  "/stovsugeren": Bot,
};

// Fargerike ikoner i GoT-stil — én distinkt farge per sal, matcher salens tema.
const ROUTE_ICON_COLOR: Partial<Record<RoutePath, string>> = {
  "/": "#d4af37",                    // gull — husets sal
  "/var": "#fbbf24",                 // sol — gyllen
  "/turer": "#34d399",               // ferden — smaragd
  "/got-saga": "#a855f7",            // Westeros — drage-lilla
  "/agenda": "#f472b6",              // krøniken — rosa pergament
  "/push-varslinger": "#fb923c",     // ravnens varsel — oransje
  "/vakttarnet": "#22d3ee",          // vaktens øye — cyan
  "/hytta": "#60a5fa",               // fjellet — vinterblå
  "/smarthus": "#facc15",            // smartborg — glødende gul
  "/lys": "#fde047",                 // lys — lampegult
  "/stromkroniken": "#eab308",       // strøm — lyngull
  "/oppussing-borgen": "#f97316",    // hammer — gloende
  "/oppussing-hytta": "#a16207",     // tre — rustbrun
  "/matvarer": "#84cc16",            // varer — markens grønt
  "/kvitteringer": "#94a3b8",        // pergament — sølv
  "/okonomi": "#d4af37",             // Iron Bank — gull
  "/hundene": "#f59e0b",             // ulv/hund — ravgull
  "/trening": "#ef4444",             // sverd — blod
  "/varsler": "#dc2626",             // farevarsel — rødt skilt
  "/steintavle": "#cbd5e1",          // stein — lys grå
  "/skatte-utregningen": "#d4af37",  // gull-mynt
  "/gressklipper": "#10b981",        // gressklipper — gressgrønn
  "/stovsugeren": "#38bdf8",         // støvsuger — sky-cyan
};

// Public halls — open to any visitor entering the courtyard.
// Other halls only appear after the portal is opened (login).
const navLinks: NavLink[] = [
  { to: "/", label: "Hjem", public: true },
  { to: "/var", label: "Vær", public: true },
  { to: "/pollen", label: "Pollen", public: true },
  { to: "/turer", label: "Ferden", public: true },
  { to: "/got-saga", label: "Westeros", public: true },
  { to: "/agenda", label: "Søppel, bursdager og meldinger" },
  { to: "/push-varslinger", label: "Innstillinger" },
  { to: "/vakttarnet", label: "Vakttårnet" },
  { to: "/hytta", label: "Hytta", public: true },
  { to: "/smarthus", label: "Smartborg" },
  { to: "/lys", label: "Lys" },
  { to: "/gressklipper", label: "Gressklipper" },
  { to: "/stovsugeren", label: "Støvsugeren" },
  { to: "/stromkroniken", label: "Strømkrøniken" },
  { to: "/oppussing-borgen", label: "Prosjekter på Borgen" },
  { to: "/oppussing-hytta", label: "Prosjekter på hytta" },
  { to: "/matvarer", label: "Varer" },
  { to: "/kvitteringer", label: "Kvitteringer" },
  { to: "/okonomi", label: "Husholdningens hvelv" },
  { to: "/skatte-utregningen", label: "Skatte utregningen" },
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
    // Primær: navnet på push-mottakeren lagret på denne enheten.
    try {
      const stored = (typeof window !== "undefined")
        ? (localStorage.getItem("agenda_push_who") || "")
        : "";
      if (stored && stored !== "Alle") {
        setWho(stored);
        return;
      }
    } catch { /* ignore */ }
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
  const { prefs: menuPrefs, toggleFavorite } = useMenuPrefs();
  const badgeSettings = useHeaderBadgeSettings();
  const showB = (id: string) => isBadgeVisible(badgeSettings, id, who);

  // Web-favoritter (egne snarveier til nettsider) — felles + per bruker
  const [webFavs, setWebFavs] = useState<{ id: string; who: string; label: string; url: string; icon: string }[]>([]);
  const [favOpen, setFavOpen] = useState(false);
  const [favOpenMobile, setFavOpenMobile] = useState(false);
  useEffect(() => {
    let cancelled = false;
    import("@/integrations/supabase/client").then(({ supabase }) => {
      supabase
        .from("web_favorites")
        .select("id,who,label,url,icon,sort_order,created_at")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .then(({ data }) => { if (!cancelled && data) setWebFavs(data as any); });
    });
    return () => { cancelled = true; };
  }, [who]);
  const myWebFavs = webFavs.filter((f) => f.who === "Alle" || f.who === who);

  // Pollen-koordinater fra brukerens valgte default for /pollen (eller fallback Borgen)
  const fetchDefaultLoc = useServerFn(getDefaultLocation);
  const [pollenCoord, setPollenCoord] = useState<{ lat: number; lon: number }>(BORGEN_COORD);
  useEffect(() => {
    let cancelled = false;
    fetchDefaultLoc({ data: { who: who || "Offentlig", page: "pollen" } })
      .then((r) => {
        if (cancelled) return;
        if (typeof r?.lat === "number" && typeof r?.lon === "number") {
          setPollenCoord({ lat: r.lat, lon: r.lon });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [who, fetchDefaultLoc]);

  // Visitors outside the gate only see public halls; authed users see everything.
  const menuVisibility = useMenuVisibility();
  const baseLinks = (isAuthed ? navLinks : navLinks.filter((l) => l.public))
    .filter((l) => isMenuLinkVisible(menuVisibility, l.to))
    .filter((l) => l.to !== "/okonomi" || who === "Arne");

  // Sorter: Hjem alltid først, Steintavle alltid sist, deretter favoritter (hvis på),
  // så bruksfrekvens (hvis på), ellers original rekkefølge.
  const sortedLinks = (() => {
    const first = baseLinks.filter((l) => l.to === ALWAYS_FIRST);
    const last = baseLinks.filter((l) => l.to === ALWAYS_LAST);
    const rest = baseLinks.filter((l) => l.to !== ALWAYS_LAST && l.to !== ALWAYS_FIRST);

    const favSet = menuPrefs.favoritesEnabled ? new Set(menuPrefs.favorites) : new Set<string>();
    const favs = menuPrefs.favoritesEnabled
      ? menuPrefs.favorites
          .map((p) => rest.find((l) => l.to === p))
          .filter((x): x is NavLink => !!x)
      : [];

    const others = rest.filter((l) => !favSet.has(l.to));
    if (menuPrefs.sortByUsage) {
      const indexed = others.map((l, i) => ({ link: l, i, count: usage[l.to] ?? 0 }));
      indexed.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.i - b.i;
      });
      return [...first, ...favs, ...indexed.map((x) => x.link), ...last];
    }
    return [...first, ...favs, ...others, ...last];
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
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/"
            aria-label="Hjem"
            title="Hjem"
            className="group w-9 h-9 rounded-full border border-primary/40 flex items-center justify-center text-primary hover:shadow-[0_0_20px_var(--color-primary)] transition-shadow shrink-0"
          >
            <Home size={16} />
          </Link>
          <button
            type="button"
            aria-label="Dobbel-tapp for å scrolle til topp"
            onClick={() => {
              const w = window as any;
              const now = Date.now();
              const prev = w.__headerTitleLastTap ?? 0;
              if (now - prev < 350) {
                try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
                w.__headerTitleLastTap = 0;
                return;
              }
              w.__headerTitleLastTap = now;
            }}
            onDoubleClick={() => {
              try { window.scrollTo({ top: 0, behavior: "smooth" }); } catch { window.scrollTo(0, 0); }
            }}
            className="leading-tight text-left bg-transparent border-0 p-0 cursor-pointer"
            style={{ WebkitTapHighlightColor: "transparent" }}
          >
            <div className="text-display text-sm tracking-[0.25em] text-primary flex items-center gap-1.5">
              <Crown size={12} className="text-primary/80" />
              <span>HOUSE PETTERSEN RIIS</span>
              <Swords size={12} className="text-primary/80" />
            </div>
            <div className="text-[10px] text-muted-foreground tracking-widest flex items-center gap-1.5">
              <Shield size={9} className="text-muted-foreground/70" />
              <span>OF SKIEN</span>
            </div>
          </button>
        </div>

        <nav className="hidden flex-1 flex-wrap items-center justify-start gap-x-2 gap-y-2">
          <span className="inline-flex items-center gap-0.5 relative">
            <button
              type="button"
              onClick={() => setFavOpen((v) => !v)}
              className="got-nav-btn inline-flex items-center gap-1.5"
              title="Vis favoritter"
              aria-expanded={favOpen}
            >
              <Globe size={12} className="opacity-80" />
              <span>Favoritter</span>
              {favOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
            {favOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 min-w-[200px] rounded-md border border-border bg-card/95 backdrop-blur shadow-lg p-1 flex flex-col">
                {myWebFavs.length === 0 && (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Ingen snarveier ennå.</div>
                )}
                {myWebFavs.map((f) => (
                  <a
                    key={f.id}
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setFavOpen(false)}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted/40 rounded"
                  >
                    <FavGlyph icon={f.icon} url={f.url} size={12} />
                    <span className="truncate">{f.label}</span>
                    {f.who === "Alle" && <span className="ml-auto text-[9px] opacity-60">felles</span>}
                  </a>
                ))}
              </div>
            )}
          </span>
          {sortedLinks.map((l) => {
            const count = usage[l.to] ?? 0;
            const isFav = menuPrefs.favorites.includes(l.to);
            const canFav = menuPrefs.favoritesEnabled && l.to !== ALWAYS_FIRST && l.to !== ALWAYS_LAST;
            return (
              <span key={l.to} className="inline-flex items-center gap-0.5">
                {canFav && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFavorite(l.to); }}
                    aria-label={isFav ? "Fjern favoritt" : "Legg til favoritt"}
                    title={isFav ? "Fjern favoritt" : "Legg til favoritt"}
                    className={`p-0.5 transition ${isFav ? "text-primary" : "text-muted-foreground/40 hover:text-primary"}`}
                  >
                    <Star size={11} fill={isFav ? "currentColor" : "none"} />
                  </button>
                )}
                <Link
                  to={l.to}
                  preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                  activeOptions={l.to === "/" ? { exact: true } : undefined}
                  onClick={() => bump(l.to)}
                  className="got-nav-btn inline-flex items-center gap-1.5"
                >
                  {l.to === "/pollen"
                    ? <PollenIcon lat={pollenCoord.lat} lon={pollenCoord.lon} />
                    : ROUTE_ICON[l.to] ? (() => { const I = ROUTE_ICON[l.to]!; return <span style={{ color: ROUTE_ICON_COLOR[l.to], display: "inline-flex" }}><I size={13} strokeWidth={2.25} /></span>; })() : null}
                  <span>{l.label}</span>
                  {count > 0 && menuPrefs.sortByUsage && showB("usage_count") && <UsageBadge count={count} />}
                  {l.to === "/" && showB("uv_hjem") && <UvBadge lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
                  {l.to === "/" && showB("temp_tollnes") && <TempBadge stationMatch="tollnes" storageKey="hdr.temp.tollnes" />}
                  {l.to === "/hytta" && showB("uv_hytta") && <UvBadge lat={HYTTA_COORD.lat} lon={HYTTA_COORD.lon} />}
                  {l.to === "/hytta" && showB("temp_hytta") && <TempBadge stationMatch="hytta" storageKey="hdr.temp.hytta" />}
                  {l.to === "/pollen" && showB("pollen") && <PollenBadge lat={pollenCoord.lat} lon={pollenCoord.lon} />}
                  {l.to === "/push-varslinger" && showB("push_today") && <PushTodayBadge inline />}
                  {l.to === "/lys" && showB("lights_on") && <LightsOnBadge inline />}
                  {l.to === "/var" && showB("weather_days") && <WeatherDaysBadge inline useGps lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} startOffset={badgeSettings.weather.startOffset} days={badgeSettings.weather.days} showTemp={badgeSettings.weather.showTemp} />}
                  {l.to === "/var" && showB("weather_temp") && <CurrentTempBadge inline lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
                  {l.to === "/smarthus" && showB("mower_status") && <MowerStatusBadge inline />}
                  {l.to === "/gressklipper" && <>{showB("gardena_status") && <GardenaStatusBadge inline />}{showB("gardena_battery") && <GardenaBatteryBadge inline />}{showB("gardena_signal") && <GardenaSignalBadge inline />}</>}
                  {l.to === "/stovsugeren" && <>{showB("roborock_hjemme_status") && <RoborockStatusBadge inline match="hjem" name="Hjemme" />}{showB("roborock_hytta_status") && <RoborockStatusBadge inline match="hytt" name="Hytta" />}</>}
                  {l.to === "/vakttarnet" && <>{showB("alarm_state") && <AlarmStateBadge inline />}{showB("utgangsdoren_lock") && <UtgangsdorenLockBadge inline />}</>}
                  {l.to === "/varsler" && showB("alerts_severity") && <AlertsSeverityBadge inline />}
                  {l.to === "/stromkroniken" && showB("power_vs_yesterday") && <PowerVsYesterdayBadge inline />}
                  {l.to === "/trening" && <>{showB("steps_arne") && <StepsTodayBadge inline owner="arne" />}{showB("steps_rebekka") && <StepsTodayBadge inline owner="rebekka" />}{showB("training_4w") && <TrainingLast4WeeksBadge inline />}</>}
                  {l.to === "/agenda" && showB("garbage_next") && <GarbageNextPickupBadge inline />}
                  {l.to === "/okonomi" && showB("budget_remaining") && <BudgetRemainingBadge inline />}
                  {l.to === "/okonomi" && showB("okonomi_brukt") && <OkonomiBruktBadge inline />}
                  {l.to === "/okonomi" && showB("okonomi_inntekt") && <OkonomiInntektBadge inline />}
                  {l.to === "/okonomi" && showB("okonomi_budsjett") && <OkonomiBudsjettBadge inline />}
                  {l.to === "/okonomi" && showB("okonomi_overskudd") && <OkonomiOverskuddBadge inline />}
                  {l.to === "/okonomi" && showB("okonomi_snitt_dag") && <OkonomiSnittPrDagBadge inline />}
                  {l.to === "/okonomi" && showB("okonomi_igjen_dag") && <OkonomiIgjenPrDagBadge inline />}
                </Link>
              </span>
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
          className={`relative text-primary p-2 rounded-md transition ${
            open ? "" : "shadow-[0_0_10px_hsl(var(--primary)/0.55)] hover:shadow-[0_0_16px_hsl(var(--primary)/0.8)]"
          }`}
          onClick={() => setOpen((v) => { if (!v) setFavOpenMobile(false); return !v; })}
          aria-label="Meny"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <nav className="mobile-menu-popup border-t border-border bg-card/95 backdrop-blur">
          <div className="container mx-auto px-4 py-2 flex flex-col max-h-[calc(100vh-64px)] overflow-y-auto overscroll-contain">
            <div className="border-b border-border">
              <button
                type="button"
                onClick={() => setFavOpenMobile((v) => !v)}
                className="w-full px-2 py-2.5 text-xs tracking-wider uppercase text-muted-foreground hover:text-primary flex items-center gap-2"
                aria-expanded={favOpenMobile}
              >
                <Globe size={14} className="opacity-80" />
                <span className="flex-1 text-left">Favoritter</span>
                {favOpenMobile ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {favOpenMobile && (
                <div className="pl-6 pb-2 flex flex-col">
                  {myWebFavs.length === 0 && (
                    <div className="px-2 py-2 text-[11px] text-muted-foreground">Ingen snarveier ennå.</div>
                  )}
                  {myWebFavs.map((f) => (
                    <a
                      key={f.id}
                      href={f.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => { setFavOpenMobile(false); setOpen(false); }}
                      className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground hover:text-primary"
                    >
                      <FavGlyph icon={f.icon} url={f.url} size={12} />
                      <span className="truncate flex-1">{f.label}</span>
                      {f.who === "Alle" && <span className="text-[9px] opacity-60">felles</span>}
                    </a>
                  ))}
                </div>
              )}
            </div>
            {sortedLinks.map((l) => {
              const count = usage[l.to] ?? 0;
              const isFav = menuPrefs.favorites.includes(l.to);
              const canFav = menuPrefs.favoritesEnabled && l.to !== ALWAYS_FIRST && l.to !== ALWAYS_LAST;
              return (
                <div key={l.to} className="flex items-center gap-1 border-b border-border last:border-0">
                  {canFav && (
                    <button
                      type="button"
                      onClick={() => toggleFavorite(l.to)}
                      aria-label={isFav ? "Fjern favoritt" : "Legg til favoritt"}
                      className={`p-1.5 ${isFav ? "text-primary" : "text-muted-foreground/40"}`}
                    >
                      <Star size={13} fill={isFav ? "currentColor" : "none"} />
                    </button>
                  )}
                  <Link
                    to={l.to}
                    preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
                    activeOptions={l.to === "/" ? { exact: true } : undefined}
                    onClick={() => {
                      bump(l.to);
                      setOpen(false);
                    }}
                    className="flex-1 px-2 py-2.5 text-xs tracking-wider uppercase text-muted-foreground hover:text-primary data-[status=active]:text-primary data-[status=active]:font-semibold flex items-center gap-2"
                  >
                    {l.to === "/pollen"
                      ? <PollenIcon lat={pollenCoord.lat} lon={pollenCoord.lon} />
                      : ROUTE_ICON[l.to] ? (() => { const I = ROUTE_ICON[l.to]!; return <span style={{ color: ROUTE_ICON_COLOR[l.to], display: "inline-flex" }}><I size={15} strokeWidth={2.25} /></span>; })() : null}
                    <span className="flex-1">{l.label}</span>
                    {count > 0 && menuPrefs.sortByUsage && showB("usage_count") && <UsageBadge count={count} />}
                    {l.to === "/" && showB("uv_hjem") && <UvBadge lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
                    {l.to === "/" && showB("temp_tollnes") && <TempBadge stationMatch="tollnes" storageKey="hdr.temp.tollnes" />}
                    {l.to === "/hytta" && showB("uv_hytta") && <UvBadge lat={HYTTA_COORD.lat} lon={HYTTA_COORD.lon} />}
                    {l.to === "/hytta" && showB("temp_hytta") && <TempBadge stationMatch="hytta" storageKey="hdr.temp.hytta" />}
                    {l.to === "/pollen" && showB("pollen") && <PollenBadge lat={pollenCoord.lat} lon={pollenCoord.lon} />}
                    {l.to === "/push-varslinger" && showB("push_today") && <PushTodayBadge inline />}
                    {l.to === "/lys" && showB("lights_on") && <LightsOnBadge inline />}
                    {l.to === "/var" && showB("weather_days") && <WeatherDaysBadge inline useGps lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} startOffset={badgeSettings.weather.startOffset} days={badgeSettings.weather.days} showTemp={badgeSettings.weather.showTemp} />}
                    {l.to === "/var" && showB("weather_temp") && <CurrentTempBadge inline lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
                    {l.to === "/smarthus" && showB("mower_status") && <MowerStatusBadge inline />}
                    {l.to === "/gressklipper" && <>{showB("gardena_status") && <GardenaStatusBadge inline />}{showB("gardena_battery") && <GardenaBatteryBadge inline />}{showB("gardena_signal") && <GardenaSignalBadge inline />}</>}
                    {l.to === "/stovsugeren" && <>{showB("roborock_hjemme_status") && <RoborockStatusBadge inline match="hjem" name="Hjemme" />}{showB("roborock_hytta_status") && <RoborockStatusBadge inline match="hytt" name="Hytta" />}</>}
                    {l.to === "/vakttarnet" && <>{showB("alarm_state") && <AlarmStateBadge inline />}{showB("utgangsdoren_lock") && <UtgangsdorenLockBadge inline />}</>}
                    {l.to === "/varsler" && showB("alerts_severity") && <AlertsSeverityBadge inline />}
                    {l.to === "/stromkroniken" && showB("power_vs_yesterday") && <PowerVsYesterdayBadge inline />}
                    {l.to === "/trening" && <>{showB("steps_arne") && <StepsTodayBadge inline owner="arne" />}{showB("steps_rebekka") && <StepsTodayBadge inline owner="rebekka" />}{showB("training_4w") && <TrainingLast4WeeksBadge inline />}</>}
                    {l.to === "/agenda" && showB("garbage_next") && <GarbageNextPickupBadge inline />}
                    {l.to === "/okonomi" && showB("budget_remaining") && <BudgetRemainingBadge inline />}
                    {l.to === "/okonomi" && showB("okonomi_brukt") && <OkonomiBruktBadge inline />}
                    {l.to === "/okonomi" && showB("okonomi_inntekt") && <OkonomiInntektBadge inline />}
                    {l.to === "/okonomi" && showB("okonomi_budsjett") && <OkonomiBudsjettBadge inline />}
                    {l.to === "/okonomi" && showB("okonomi_overskudd") && <OkonomiOverskuddBadge inline />}
                    {l.to === "/okonomi" && showB("okonomi_snitt_dag") && <OkonomiSnittPrDagBadge inline />}
                    {l.to === "/okonomi" && showB("okonomi_igjen_dag") && <OkonomiIgjenPrDagBadge inline />}
                  </Link>
                </div>
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

function FavGlyph({ icon, url, size = 12 }: { icon: string; url?: string; size?: number }) {
  if (icon === FAVICON_ICON) {
    const f = url ? faviconUrl(url, 32) : null;
    if (f) return <img src={f} alt="" style={{ width: size, height: size }} />;
    return <Globe size={size} />;
  }
  const I = getWebFavIcon(icon);
  const c = getWebFavIconColor(icon);
  return <I size={size} color={c} />;
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

// Lineær interpolasjon mellom to fargeankre i HSL-rom.
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
function mixHsl(
  c1: { h: number; s: number; l: number },
  c2: { h: number; s: number; l: number },
  t: number,
) {
  return {
    h: lerp(c1.h, c2.h, t),
    s: lerp(c1.s, c2.s, t),
    l: lerp(c1.l, c2.l, t),
  };
}

// Temperaturfarge: mørk blå (kaldt) → lys blå → grønn (komfort) → rød (varmt).
// Myke gradientoverganger med god lesbarhet på mørk bakgrunn.
function tempColor(t: number): string {
  // Ankre: temp → HSL
  // < 0°C: mørk blå
  // 0°C: tydelig blå
  // 15°C: nøytral / lys grønn-blå
  // 19°C: klar grønn (komfort)
  // 25°C: lys rød
  // 35°C+: dyp rød
  const stops: { t: number; c: { h: number; s: number; l: number } }[] = [
    { t: -20, c: { h: 230, s: 75, l: 40 } }, // mørk blå
    { t: 0,   c: { h: 215, s: 80, l: 55 } }, // tydelig blå
    { t: 10,  c: { h: 200, s: 70, l: 62 } }, // lys blå
    { t: 15,  c: { h: 165, s: 55, l: 60 } }, // teal mot grønn
    { t: 19,  c: { h: 140, s: 60, l: 55 } }, // klar grønn (komfort)
    { t: 22,  c: { h: 120, s: 55, l: 58 } }, // grønn
    { t: 25,  c: { h:  20, s: 80, l: 65 } }, // lys rød
    { t: 30,  c: { h:  10, s: 80, l: 58 } },
    { t: 40,  c: { h:   0, s: 80, l: 50 } }, // dyp rød
  ];
  if (t <= stops[0].t) {
    const c = stops[0].c;
    return `hsl(${c.h.toFixed(0)} ${c.s}% ${c.l}%)`;
  }
  if (t >= stops[stops.length - 1].t) {
    const c = stops[stops.length - 1].c;
    return `hsl(${c.h.toFixed(0)} ${c.s}% ${c.l}%)`;
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const x = (t - a.t) / (b.t - a.t);
      const c = mixHsl(a.c, b.c, x);
      return `hsl(${c.h.toFixed(0)} ${c.s.toFixed(0)}% ${c.l.toFixed(0)}%)`;
    }
  }
  return `hsl(140 60% 55%)`;
}

function TempBadge({ stationMatch, storageKey }: { stationMatch: string; storageKey: string }) {
  const fetchData = useServerFn(getNetatmoWeatherStation);
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchData({ data: { stationMatch } })
        .then((r) => {
          if (cancelled || !r.ok) return;
          const out = r.modules.find((m) => m.type === "NAModule1");
          const t = out?.metrics.temperature;
          if (typeof t === "number" && Number.isFinite(t)) setLive(t);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [stationMatch, fetchData]);
  const { value } = useLastGood(storageKey, live);
  if (value == null) return null;
  const color = tempColor(value);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-[9px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px] tabular-nums"
      style={{
        background: `color-mix(in oklab, ${color} 22%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
      }}
      title={`Ute nå: ${value.toFixed(1)}°`}
    >
      {value.toFixed(0)}°
    </span>
  );
}

// Pollen-terskler matcher LivePollen (NAAF-skalert).
function pollenLevel(allergen: "alder" | "birch" | "grass" | "mugwort", v: number) {
  let t: { low: number; mod: number; high: number; veryHigh: number };
  switch (allergen) {
    case "birch": t = { low: 1, mod: 5, high: 30, veryHigh: 80 }; break;
    case "alder": t = { low: 1, mod: 5, high: 25, veryHigh: 70 }; break;
    case "grass": t = { low: 1, mod: 5, high: 20, veryHigh: 50 }; break;
    case "mugwort": t = { low: 1, mod: 5, high: 20, veryHigh: 50 }; break;
  }
  if (v >= t.veryHigh) return { rank: 4, label: "Svært høy", color: "oklch(0.55 0.25 15)" };
  if (v >= t.high) return { rank: 3, label: "Høy", color: "oklch(0.65 0.20 25)" };
  if (v >= t.mod) return { rank: 2, label: "Moderat", color: "oklch(0.78 0.15 70)" };
  if (v >= t.low) return { rank: 1, label: "Lav", color: "oklch(0.72 0.15 140)" };
  return { rank: 0, label: "OK", color: "oklch(0.70 0.18 145)" };
}

type Allergen = "alder" | "birch" | "grass" | "mugwort";

const ALLERGEN_EMOJI: Record<Allergen, string> = {
  alder: "🌳",   // Or
  birch: "🌲",   // Bjørk
  grass: "🌾",   // Gress
  mugwort: "🌿", // Burot
};
const ALLERGEN_NAME: Record<Allergen, string> = {
  alder: "Or",
  birch: "Bjørk",
  grass: "Gress",
  mugwort: "Burot",
};

function useWorstPollen(lat: number, lon: number) {
  const [worst, setWorst] = useState<{ label: string; color: string; rank: number; allergen: Allergen } | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=alder_pollen,birch_pollen,grass_pollen,mugwort_pollen&timezone=Europe%2FOslo&forecast_days=1`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const h = data?.hourly;
        if (!h?.time) return;
        const allergens: Allergen[] = ["alder", "birch", "grass", "mugwort"];
        let best: { label: string; color: string; rank: number; allergen: Allergen } = { ...pollenLevel("birch", 0), allergen: "birch" };
        for (const a of allergens) {
          const arr: number[] = h[`${a}_pollen`] ?? [];
          const max = arr.reduce((m, v) => (typeof v === "number" && v > m ? v : m), 0);
          const lvl = pollenLevel(a, max);
          if (lvl.rank > best.rank) best = { ...lvl, allergen: a };
        }
        if (!cancelled) setWorst(best);
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 60 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lat, lon]);
  return worst;
}

function AllergenGlyph({ allergen, size = 12, color }: { allergen: Allergen; size?: number; color?: string }) {
  if (allergen === "birch") {
    return (
      <img
        src={birchImg}
        alt=""
        aria-hidden="true"
        style={{ width: size, height: size, objectFit: "contain" }}
      />
    );
  }
  return (
    <span aria-hidden style={{ fontSize: size, lineHeight: 1, color }}>
      {ALLERGEN_EMOJI[allergen]}
    </span>
  );
}

function PollenIcon({ lat, lon }: { lat: number; lon: number }) {
  const worst = useWorstPollen(lat, lon);
  if (!worst) return null;
  if (worst.allergen === "birch") {
    return <AllergenGlyph allergen="birch" size={14} />;
  }
  return (
    <Flower2
      size={12}
      style={{ color: worst.color }}
      aria-hidden="true"
    />
  );
}

function PollenBadge({ lat, lon }: { lat: number; lon: number }) {
  const worst = useWorstPollen(lat, lon);
  if (!worst) return null;
  return (
    <span
      className="inline-flex items-center gap-1 justify-center rounded-full text-[9px] font-semibold leading-none px-1.5 py-0.5"
      style={{
        background: `color-mix(in oklab, ${worst.color} 22%, transparent)`,
        color: worst.color,
        border: `1px solid color-mix(in oklab, ${worst.color} 50%, transparent)`,
      }}
      title={`Pollen i dag: ${worst.label} (${ALLERGEN_NAME[worst.allergen]})`}
    >
      {worst.label}
      <AllergenGlyph allergen={worst.allergen} size={12} color={worst.color} />
    </span>
  );
}
