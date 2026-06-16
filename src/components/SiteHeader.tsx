import { Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Menu, X, LogOut, Crown, Swords, Shield, KeyRound, Home, Star, Flower2,
  Sun, Compass, CalendarDays, BellRing, Eye, Mountain, Lightbulb, Lamp, Flame, Zap,
  Receipt, Dumbbell, AlertTriangle, ScrollText, Globe, ChevronDown, ChevronRight,
  TreePine, Coins, Bot, Wallet, Volume2, Settings, Gauge, Plane, Folder, Smartphone } from "lucide-react";


import { logoutFn } from "@/lib/auth.functions";
import { getIcon as getWebFavIcon, getIconColor as getWebFavIconColor, faviconUrl, FAVICON_ICON } from "@/lib/web-favorite-icons";
import birchImg from "@/assets/pollen-birch.png";
import { useAuthStatus } from "@/hooks/use-auth-status";
import { openLoginDialog } from "@/components/LoginDialog";
import { useUvSun, uvLevel } from "@/hooks/use-uv-sun";
import { getNameForCurrentIp, getDefaultLocation } from "@/lib/user-locations.functions";
import { useNavUsage } from "@/hooks/use-nav-usage";
import { useMenuPrefs } from "@/hooks/use-menu-prefs";
import { getNetatmoWeatherStation } from "@/lib/netatmo-weather.functions";
import { getNetatmoLiveTrend } from "@/lib/netatmo-history";
import { useLastGood } from "@/hooks/use-last-good";
import { PushTodayBadge, LightsOnBadge, WeatherDaysBadge, AlarmStateBadge, AlertsSeverityBadge, PowerVsYesterdayBadge, TrainingLast4WeeksBadge, UtgangsdorenLockBadge, StepsTodayBadge, MowerStatusBadge, BassengTempBadge, CurrentTempBadge, GarbageNextPickupBadge, GardenaStatusBadge, GardenaBatteryBadge, GardenaSignalBadge, RoborockStatusBadge, BudgetRemainingBadge, OkonomiBruktBadge, OkonomiInntektBadge, OkonomiBudsjettBadge, OkonomiOverskuddBadge, OkonomiSnittPrDagBadge, OkonomiIgjenPrDagBadge } from "@/components/HallBadges";
import { useHeaderBadgeSettings, isBadgeVisible } from "@/hooks/use-header-badge-settings";
import { useMenuVisibility, isMenuLinkVisible } from "@/hooks/use-menu-visibility";
import { fetchOpenMeteoPollen } from "@/lib/air-quality-fetch.functions";

const BORGEN_COORD = { lat: 59.1789, lon: 9.5732 };
const HYTTA_COORD = { lat: 59.8733, lon: 9.4297 };
const TOLLNES_COORD = { lat: 59.2096, lon: 9.609 };

type RoutePath =
  | "/"
  | "/agenda"
  | "/push-varslinger"
  | "/var"
  | "/pollen"
  | "/vakttarnet"
  | "/hytta"
  | "/trening"
  | "/turer"
  | "/stromkroniken"
  | "/varsler"
  | "/smarthus"
  | "/smart-dashbord"
  | "/iphone-app"
  | "/lys"
  | "/varme"
  | "/steintavle"
  | "/steintavle-2"
  | "/kvitteringer"
  | "/okonomi"
  | "/skatte-utregningen"
  | "/gressklipper"
  | "/stovsugeren"
  | "/decibel"
  | "/roborock"
  | "/planter"
  | "/fly"
  | "/ytelse"
  | "/ssb-statistikk";


type NavLink = { to: RoutePath; label: string; public?: boolean };

const HOMEY_BACKED_ROUTES: RoutePath[] = ["/smarthus", "/var", "/steintavle"];

// Hjem skal alltid stå først, og Steintavle / Steintavle 2 / Smarthus alltid sist — uavhengig av bruksstatistikk.
const ALWAYS_FIRST: RoutePath = "/";
const ALWAYS_LAST_LIST: RoutePath[] = ["/steintavle", "/steintavle-2", "/smart-dashbord", "/iphone-app"];
const ALWAYS_LAST_SET = new Set<RoutePath>(ALWAYS_LAST_LIST);
const isAlwaysLast = (p: RoutePath) => ALWAYS_LAST_SET.has(p);

// Ikon for hver menyside (pollen håndteres separat med PollenIcon)
const ROUTE_ICON: Partial<Record<RoutePath, React.ComponentType<{ size?: number; className?: string; color?: string; fill?: string; strokeWidth?: number }>>> = {
  "/": Home,
  "/var": Sun,
  "/turer": Compass,
  "/agenda": CalendarDays,
  "/push-varslinger": BellRing,
  "/vakttarnet": Eye,
  "/hytta": Mountain,
  "/smarthus": Lightbulb,
  "/lys": Lamp,
  "/varme": Flame,
  "/stromkroniken": Zap,
  "/kvitteringer": Receipt,
  "/okonomi": Wallet,
  "/trening": Dumbbell,
  "/varsler": AlertTriangle,
  "/steintavle": ScrollText,
  "/steintavle-2": ScrollText,
  "/skatte-utregningen": Coins,
  "/gressklipper": Bot,
  "/stovsugeren": Bot,
  "/decibel": Volume2,
  "/roborock": Bot,
  "/planter": TreePine,
  "/fly": Plane,
  "/ytelse": Gauge,
  "/iphone-app": Smartphone,
  "/ssb-statistikk": BarChart3,
};


// Fargerike ikoner i GoT-stil — én distinkt farge per sal, matcher salens tema.
const ROUTE_ICON_COLOR: Partial<Record<RoutePath, string>> = {
  "/": "#d4af37",
  "/var": "#fbbf24",
  "/turer": "#34d399",
  "/agenda": "#f472b6",
  "/push-varslinger": "#fb923c",
  "/vakttarnet": "#22d3ee",
  "/hytta": "#60a5fa",
  "/smarthus": "#facc15",
  "/lys": "#fde047",
  "/varme": "#fb923c",
  "/stromkroniken": "#eab308",
  "/kvitteringer": "#94a3b8",
  "/okonomi": "#d4af37",
  "/trening": "#ef4444",
  "/varsler": "#dc2626",
  "/steintavle": "#cbd5e1",
  "/steintavle-2": "#94a3b8",
  "/skatte-utregningen": "#d4af37",
  "/gressklipper": "#10b981",
  "/stovsugeren": "#38bdf8",
  "/decibel": "#f43f5e",
  "/roborock": "#a78bfa",
  "/planter": "#22c55e",
  "/fly": "#38bdf8",
  "/ytelse": "#22d3ee",
  "/iphone-app": "#60a5fa",
  "/ssb-statistikk": "#f59e0b",
};


// Public halls — open to any visitor entering the courtyard.
// Other halls only appear after the portal is opened (login).
const navLinks: NavLink[] = [
  { to: "/", label: "Hjem", public: true },
  { to: "/var", label: "Vær", public: true },
  { to: "/pollen", label: "Luftkvalitet", public: true },
  { to: "/turer", label: "Ferden", public: true },
  { to: "/agenda", label: "Søppel, bursdager og meldinger" },
  { to: "/push-varslinger", label: "Innstillinger" },
  { to: "/vakttarnet", label: "Vakttårnet" },
  { to: "/ytelse", label: "Ytelse" },
  { to: "/hytta", label: "Hytta", public: true },
  { to: "/smarthus", label: "Smarthus" },
  { to: "/smart-dashbord", label: "Smart dashbord" },
  { to: "/lys", label: "Lys" },
  { to: "/varme", label: "Varme & Klima" },
  { to: "/gressklipper", label: "Gressklipper" },
  { to: "/stovsugeren", label: "Støvsugeren" },
  { to: "/stromkroniken", label: "Strømkrøniken" },
  { to: "/kvitteringer", label: "Kvitteringer" },
  { to: "/okonomi", label: "Husholdningens hvelv" },
  { to: "/skatte-utregningen", label: "Skatte utregningen" },
  { to: "/trening", label: "Trening" },
  { to: "/varsler", label: "Farevarsler", public: true },
  { to: "/decibel", label: "Decibelmåler", public: true },
  { to: "/roborock", label: "Roborock" },
  { to: "/planter", label: "Planter & Trær" },
  { to: "/fly", label: "Fly i nærheten", public: true },
  { to: "/steintavle", label: "Steintavle" },
  { to: "/steintavle-2", label: "Steintavle 2" },
  { to: "/iphone-app", label: "iPhone App" },
  { to: "/ssb-statistikk", label: "Norges-statistikk" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLElement | null>(null);


  
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
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const toggleFolder = (id: string) => setOpenFolders((s) => ({ ...s, [id]: !s[id] }));
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

  // Pollen-koordinater: alltid Tollnes (brukerønske)
  const fetchDefaultLoc = useServerFn(getDefaultLocation);
  void fetchDefaultLoc;
  const [pollenCoord] = useState<{ lat: number; lon: number }>(TOLLNES_COORD);

  // Krymp menynavn + badges bare når de ikke får plass på én linje.
  useEffect(() => {
    if (!open || !badgeSettings.fitOneLine) return;
    const root = mobileMenuRef.current;
    if (!root) return;

    const fitOne = (el: HTMLElement) => {
      const badges = el.querySelector<HTMLElement>('[data-fit-badges]');
      if (badges) badges.style.fontSize = "";
      const avail = el.clientWidth;
      if (!avail) return;
      if (el.scrollWidth <= avail + 0.5) return;
      if (!badges) return;
      // Krymp kun badgene iterativt til raden får plass på én linje
      let scale = 1;
      for (let i = 0; i < 12; i++) {
        scale = Math.max(0.5, scale - 0.06);
        badges.style.fontSize = `${scale}em`;
        if (el.scrollWidth <= avail + 0.5 || scale <= 0.5) break;
      }
    };

    const fitAll = () => {
      root.querySelectorAll<HTMLElement>('[data-fit-one-line="1"]').forEach(fitOne);
    };

    fitAll();

    const ro = new ResizeObserver(fitAll);
    ro.observe(root);
    root.querySelectorAll<HTMLElement>('[data-fit-one-line="1"]').forEach((el) => ro.observe(el));

    const mo = new MutationObserver(() => fitAll());
    mo.observe(root, { childList: true, subtree: true, characterData: true });

    if ((document as any).fonts?.ready) {
      (document as any).fonts.ready.then(fitAll).catch(() => {});
    }

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [open, badgeSettings.fitOneLine]);




  // Visitors outside the gate only see public halls; authed users see everything.
  const menuVisibility = useMenuVisibility();
  const baseLinks = (isAuthed ? navLinks : navLinks.filter((l) => l.public))
    .filter((l) => isMenuLinkVisible(menuVisibility, l.to, who))
    .filter((l) => l.to !== "/okonomi" || who === "Arne");


  // Sorter: Hjem alltid først, Steintavle alltid sist, deretter favoritter (hvis på),
  // så bruksfrekvens (hvis på), ellers original rekkefølge.
  const sortedLinks = (() => {
    const first = baseLinks.filter((l) => l.to === ALWAYS_FIRST);
    const lastUnordered = baseLinks.filter((l) => isAlwaysLast(l.to));
    const last = ALWAYS_LAST_LIST
      .map((p) => lastUnordered.find((l) => l.to === p))
      .filter((x): x is NavLink => !!x);
    const rest = baseLinks.filter((l) => !isAlwaysLast(l.to) && l.to !== ALWAYS_FIRST);

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

  // Kataloger: ekskluder sider som ligger i en katalog fra hovedlisten,
  // og bygg topp/bunn-kataloger med sine resolverte NavLink-er.
  const menuFolders = menuPrefs.menuFolders ?? [];
  const folderPaths = new Set<string>();
  for (const f of menuFolders) for (const p of f.items) folderPaths.add(p);
  const flatLinks = sortedLinks.filter((l) => !folderPaths.has(l.to));
  const linkByPath = new Map(baseLinks.map((l) => [l.to as string, l] as const));
  const resolveFolder = (f: typeof menuFolders[number]) => ({
    folder: f,
    links: f.items
      .map((p) => linkByPath.get(p))
      .filter((x): x is NavLink => !!x),
  });
  const topFolders = menuFolders.filter((f) => f.position === "top").map(resolveFolder);
  const bottomFolders = menuFolders.filter((f) => f.position === "bottom").map(resolveFolder);
  const visibleSortedLinks = flatLinks;

  const renderMobileRow = (l: NavLink, opts?: { indent?: boolean }) => {
    const count = usage[l.to] ?? 0;
    const isFav = menuPrefs.favorites.includes(l.to);
    const canFav = menuPrefs.favoritesEnabled && l.to !== ALWAYS_FIRST && !isAlwaysLast(l.to);
    return (
      <div key={l.to} className={`flex items-center gap-0 border-b border-border last:border-0${opts?.indent ? " pl-3" : ""}`}>
        {canFav && (
          <button
            type="button"
            onClick={() => toggleFavorite(l.to)}
            aria-label={isFav ? "Fjern favoritt" : "Legg til favoritt"}
            className={`pl-1.5 pr-0 py-1.5 ${isFav ? "text-primary" : "text-muted-foreground/40"}`}
          >
            <Star size={13} fill={isFav ? "currentColor" : "none"} />
          </button>
        )}
        <Link
          to={l.to}
          preload={HOMEY_BACKED_ROUTES.includes(l.to) ? false : undefined}
          activeOptions={l.to === "/" ? { exact: true } : undefined}
          onClick={() => { bump(l.to); setOpen(false); }}
          className={`flex-1 pl-1 pr-2 py-2.5 tracking-wider uppercase text-muted-foreground hover:text-primary data-[status=active]:text-primary data-[status=active]:font-semibold flex items-center gap-2 text-xs${badgeSettings.fitOneLine ? " whitespace-nowrap overflow-hidden" : ""}`}
          data-fit-one-line={badgeSettings.fitOneLine ? "1" : undefined}
        >
          {l.to === "/pollen"
            ? <PollenIcon lat={pollenCoord.lat} lon={pollenCoord.lon} />
            : ROUTE_ICON[l.to] ? (() => { const I = ROUTE_ICON[l.to]!; return <span style={{ color: ROUTE_ICON_COLOR[l.to], display: "inline-flex" }}><I size={15} strokeWidth={2.25} /></span>; })() : null}
          <span className="flex-1">{l.label}</span>
          <span data-fit-badges className="contents">
          {count > 0 && menuPrefs.sortByUsage && showB("usage_count") && <UsageBadge count={count} />}
          {l.to === "/" && showB("uv_hjem") && <UvBadge lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
          {l.to === "/" && showB("temp_tollnes") && <TempBadge stationMatch="tollnes" storageKey="hdr.temp.tollnes" />}
          {l.to === "/" && showB("temp_stua_tollnes") && <TempBadge stationMatch="tollnes" storageKey="hdr.temp.stua.tollnes" variant="indoor" />}
          {l.to === "/hytta" && showB("uv_hytta") && <UvBadge lat={HYTTA_COORD.lat} lon={HYTTA_COORD.lon} />}
          {l.to === "/hytta" && showB("temp_hytta") && <TempBadge stationMatch="hytta" storageKey="hdr.temp.hytta" />}
          {l.to === "/hytta" && showB("temp_stua_hytta") && <TempBadge stationMatch="hytta" storageKey="hdr.temp.stua.hytta" variant="indoor" />}
          {l.to === "/pollen" && showB("pollen") && <PollenBadge lat={pollenCoord.lat} lon={pollenCoord.lon} />}
          {l.to === "/push-varslinger" && showB("push_today") && <PushTodayBadge inline />}
          {l.to === "/lys" && showB("lights_on") && <LightsOnBadge inline />}
          {l.to === "/var" && showB("weather_days") && <WeatherDaysBadge inline useGps lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} startOffset={badgeSettings.weather.startOffset} days={badgeSettings.weather.days} showTemp={badgeSettings.weather.showTemp} />}
          {l.to === "/var" && showB("weather_temp") && <CurrentTempBadge inline lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
          {l.to === "/smarthus" && <>{showB("mower_status") && <MowerStatusBadge inline />}{showB("basseng_temp") && <BassengTempBadge inline />}</>}
          {l.to === "/gressklipper" && <>{showB("gardena_status") && <GardenaStatusBadge inline />}{showB("gardena_battery") && <GardenaBatteryBadge inline />}{showB("gardena_signal") && <GardenaSignalBadge inline />}</>}
          {l.to === "/stovsugeren" && <>{showB("roborock_hjemme_status") && <RoborockStatusBadge inline match="hjem" name="Hjemme" />}{showB("roborock_hytta_status") && <RoborockStatusBadge inline match="hytt" name="Hytta" />}</>}
          {l.to === "/vakttarnet" && <>{showB("alarm_state") && <AlarmStateBadge inline />}{showB("utgangsdoren_lock") && <UtgangsdorenLockBadge inline />}</>}
          {l.to === "/varsler" && showB("alerts_severity") && <AlertsSeverityBadge inline />}
          {l.to === "/stromkroniken" && showB("power_vs_yesterday") && <PowerVsYesterdayBadge inline />}
          {l.to === "/trening" && <>{showB("steps_arne") && <StepsTodayBadge inline owner="arne" />}{showB("steps_rebekka") && <StepsTodayBadge inline owner="rebekka" />}{showB("training_4w") && <TrainingLast4WeeksBadge inline owner="arne" />}{showB("training_4w_rebekka") && <TrainingLast4WeeksBadge inline owner="rebekka" />}</>}
          {l.to === "/agenda" && showB("garbage_next") && <GarbageNextPickupBadge inline />}
          {l.to === "/okonomi" && showB("budget_remaining") && <BudgetRemainingBadge inline />}
          {l.to === "/okonomi" && showB("okonomi_brukt") && <OkonomiBruktBadge inline />}
          {l.to === "/okonomi" && showB("okonomi_inntekt") && <OkonomiInntektBadge inline />}
          {l.to === "/okonomi" && showB("okonomi_budsjett") && <OkonomiBudsjettBadge inline />}
          {l.to === "/okonomi" && showB("okonomi_overskudd") && <OkonomiOverskuddBadge inline />}
          {l.to === "/okonomi" && showB("okonomi_snitt_dag") && <OkonomiSnittPrDagBadge inline />}
          {l.to === "/okonomi" && showB("okonomi_igjen_dag") && <OkonomiIgjenPrDagBadge inline />}
          </span>
        </Link>
      </div>
    );
  };

  const renderFolderGroup = (entry: { folder: typeof menuFolders[number]; links: NavLink[] }) => {
    const { folder, links } = entry;
    const open = !!openFolders[folder.id];
    return (
      <div key={folder.id} className="border-b border-border">
        <button
          type="button"
          onClick={() => toggleFolder(folder.id)}
          className="w-full px-2 py-2.5 text-xs tracking-wider uppercase text-muted-foreground hover:text-primary flex items-center gap-2"
          aria-expanded={open}
        >
          <Folder size={14} className="text-primary/80" />
          <span className="flex-1 text-left">{folder.name}</span>
          <span className="text-[10px] opacity-60">{links.length}</span>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        {open && (
          <div className="pl-2 pb-1">
            {links.length === 0 && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground italic">Tom katalog.</div>
            )}
            {links.map((l) => renderMobileRow(l, { indent: true }))}
          </div>
        )}
      </div>
    );
  };

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
            const canFav = menuPrefs.favoritesEnabled && l.to !== ALWAYS_FIRST && !isAlwaysLast(l.to);
            return (
              <span key={l.to} className={`inline-flex items-center gap-0.5${badgeSettings.fitOneLine ? " whitespace-nowrap" : ""}`}>
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
                  {l.to === "/" && showB("temp_stua_tollnes") && <TempBadge stationMatch="tollnes" storageKey="hdr.temp.stua.tollnes" variant="indoor" />}
                  {l.to === "/hytta" && showB("uv_hytta") && <UvBadge lat={HYTTA_COORD.lat} lon={HYTTA_COORD.lon} />}
                  {l.to === "/hytta" && showB("temp_hytta") && <TempBadge stationMatch="hytta" storageKey="hdr.temp.hytta" />}
                  {l.to === "/hytta" && showB("temp_stua_hytta") && <TempBadge stationMatch="hytta" storageKey="hdr.temp.stua.hytta" variant="indoor" />}
                  {l.to === "/pollen" && showB("pollen") && <PollenBadge lat={pollenCoord.lat} lon={pollenCoord.lon} />}
                  {l.to === "/push-varslinger" && showB("push_today") && <PushTodayBadge inline />}
                  {l.to === "/lys" && showB("lights_on") && <LightsOnBadge inline />}
                  {l.to === "/var" && showB("weather_days") && <WeatherDaysBadge inline useGps lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} startOffset={badgeSettings.weather.startOffset} days={badgeSettings.weather.days} showTemp={badgeSettings.weather.showTemp} />}
                  {l.to === "/var" && showB("weather_temp") && <CurrentTempBadge inline lat={BORGEN_COORD.lat} lon={BORGEN_COORD.lon} />}
                  {l.to === "/smarthus" && <>{showB("mower_status") && <MowerStatusBadge inline />}{showB("basseng_temp") && <BassengTempBadge inline />}</>}
                  {l.to === "/gressklipper" && <>{showB("gardena_status") && <GardenaStatusBadge inline />}{showB("gardena_battery") && <GardenaBatteryBadge inline />}{showB("gardena_signal") && <GardenaSignalBadge inline />}</>}
                  {l.to === "/stovsugeren" && <>{showB("roborock_hjemme_status") && <RoborockStatusBadge inline match="hjem" name="Hjemme" />}{showB("roborock_hytta_status") && <RoborockStatusBadge inline match="hytt" name="Hytta" />}</>}
                  {l.to === "/vakttarnet" && <>{showB("alarm_state") && <AlarmStateBadge inline />}{showB("utgangsdoren_lock") && <UtgangsdorenLockBadge inline />}</>}
                  {l.to === "/varsler" && showB("alerts_severity") && <AlertsSeverityBadge inline />}
                  {l.to === "/stromkroniken" && showB("power_vs_yesterday") && <PowerVsYesterdayBadge inline />}
                  {l.to === "/trening" && <>{showB("steps_arne") && <StepsTodayBadge inline owner="arne" />}{showB("steps_rebekka") && <StepsTodayBadge inline owner="rebekka" />}{showB("training_4w") && <TrainingLast4WeeksBadge inline owner="arne" />}{showB("training_4w_rebekka") && <TrainingLast4WeeksBadge inline owner="rebekka" />}</>}
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

        <div className="flex items-center gap-1">
          {isAuthed && (
            <Link
              to="/push-varslinger"
              onClick={() => setOpen(false)}
              aria-label="Innstillinger"
              title="Innstillinger"
              className="text-primary p-2 rounded-md hover:bg-primary/10 transition flex items-center gap-1.5"
            >
              <Settings size={20} />
              {showB("push_today") && <PushTodayBadge inline />}
            </Link>
          )}
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
      </div>

      {open && (
        <nav ref={mobileMenuRef} className="mobile-menu-popup border-t border-border bg-card/95 backdrop-blur">
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
            {topFolders.map(renderFolderGroup)}
            {visibleSortedLinks.map((l) => renderMobileRow(l))}
            {bottomFolders.map(renderFolderGroup)}
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

function TempBadge({
  stationMatch,
  storageKey,
  variant = "outdoor",
}: {
  stationMatch: string;
  storageKey: string;
  variant?: "outdoor" | "indoor";
}) {
  const fetchData = useServerFn(getNetatmoWeatherStation);
  const fetchTrend = useServerFn(getNetatmoLiveTrend);
  const badgeSettings = useHeaderBadgeSettings();
  const showHourArrow = badgeSettings.badges["temp_arrow_hour"]?.enabled !== false;
  const showYesterdayArrow = badgeSettings.badges["temp_arrow_yesterday"]?.enabled !== false;
  const trendCacheKey = `hdr.trendcache:${stationMatch}:${variant}`;
  type TrendCache = { trend: number | null; yesterday: number | null; at: number };
  const readTrendCache = (): TrendCache | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(trendCacheKey);
      if (!raw) return null;
      return JSON.parse(raw) as TrendCache;
    } catch { return null; }
  };
  const [live, setLive] = useState<number | null>(null);
  const initialTrend = readTrendCache();
  const [trend, setTrend] = useState<number | null>(initialTrend?.trend ?? null);
  const [yesterday, setYesterday] = useState<number | null>(initialTrend?.yesterday ?? null);
  useEffect(() => {
    let cancelled = false;
    const TTL = 10 * 60_000;
    const load = (force = false) => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchData({ data: { stationMatch } })
        .then((r) => {
          if (cancelled || !r.ok) return;
          const mod = r.modules.find((m) => m.type === (variant === "indoor" ? "NAMain" : "NAModule1"));
          const t = mod?.metrics.temperature;
          if (typeof t === "number" && Number.isFinite(t)) setLive(t);
        })
        .catch(() => {});
      const cached = readTrendCache();
      if (!force && cached && Date.now() - cached.at < TTL) return;
      fetchTrend({ data: { stationMatch } })
        .then((r) => {
          if (cancelled || !r.ok) return;
          const d = variant === "indoor" ? r.inDeltaPerHour : r.outDeltaPerHour;
          const y = variant === "indoor" ? r.yesterdayInT : r.yesterdayOutT;
          const nextTrend = typeof d === "number" && Number.isFinite(d) ? d : null;
          const nextY = typeof y === "number" && Number.isFinite(y) ? y : null;
          if (nextTrend != null) setTrend(nextTrend);
          if (nextY != null) setYesterday(nextY);
          if (typeof window !== "undefined" && (nextTrend != null || nextY != null)) {
            try {
              const prev = readTrendCache();
              const payload: TrendCache = {
                trend: nextTrend ?? prev?.trend ?? null,
                yesterday: nextY ?? prev?.yesterday ?? null,
                at: Date.now(),
              };
              window.localStorage.setItem(trendCacheKey, JSON.stringify(payload));
            } catch {}
          }
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(() => load(true), 10 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [stationMatch, variant, fetchData, fetchTrend, trendCacheKey]);
  const { value } = useLastGood(storageKey, live);
  if (value == null) return null;
  const color = tempColor(value);
  // Vs i går: pil opp = varmere, ned = kaldere (terskel 0.3°)
  const dyDay = yesterday != null ? value - yesterday : null;
  let dayArrow: "up" | "down" | "flat" = "flat";
  if (dyDay != null) {
    if (dyDay > 0.1) dayArrow = "up";
    else if (dyDay < -0.1) dayArrow = "down";
  }
  // Trend-pil per time: opp hvis >+0.15°/t, ned hvis <-0.15°/t
  let arrow: "up" | "down" | "flat" = "flat";
  if (trend != null) {
    if (trend > 0.15) arrow = "up";
    else if (trend < -0.15) arrow = "down";
  }
  const arrowChar = arrow === "up" ? "▲" : arrow === "down" ? "▼" : "";
  const arrowColor = arrow === "up" ? "#fb923c" : arrow === "down" ? "#7dd3fc" : color;
  // Vis "−" når lik (innen terskel) så vi ser at pilen faktisk virker
  const dayArrowChar = dayArrow === "up" ? "▲" : dayArrow === "down" ? "▼" : (yesterday != null ? "−" : "");
  const dayArrowColor = dayArrow === "up" ? "#fb923c" : dayArrow === "down" ? "#7dd3fc" : "#9ca3af";
  return (
    <span
      className="inline-flex items-center justify-center gap-0.5 rounded-full text-[9px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px] tabular-nums"
      style={{
        background: `color-mix(in oklab, ${color} 22%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
      }}
      title={`${variant === "indoor" ? "Inne" : "Ute"} nå: ${value.toFixed(1)}°${trend != null ? ` (${trend >= 0 ? "+" : ""}${trend.toFixed(2)}°/t)` : ""}${dyDay != null ? ` · vs i går: ${dyDay >= 0 ? "+" : ""}${dyDay.toFixed(1)}°` : ""}`}
    >
      {value.toFixed(0)}°
      {showHourArrow && arrowChar && (
        <span style={{ color: arrowColor, fontSize: 8 }} title="Trend siste time">{arrowChar}</span>
      )}
      {showYesterdayArrow && dayArrowChar && (
        <span style={{ color: dayArrowColor, fontSize: 8, opacity: 0.85 }} title="vs i går">
          {dayArrowChar}
        </span>
      )}
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
  const [active, setActive] = useState<Array<{ allergen: Allergen; value: number; label: string; color: string; rank: number }>>([]);
  const fetchPollen = useServerFn(fetchOpenMeteoPollen);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await fetchPollen({ data: { lat, lon } });
        const h = data?.hourly;
        if (!h?.time) return;
        const allergens: Allergen[] = ["alder", "birch", "grass", "mugwort"];
        let best: { label: string; color: string; rank: number; allergen: Allergen } = { ...pollenLevel("birch", 0), allergen: "birch" };
        const act: Array<{ allergen: Allergen; value: number; label: string; color: string; rank: number }> = [];
        for (const a of allergens) {
          const arr: number[] = h[`${a}_pollen`] ?? [];
          const max = arr.reduce((m, v) => (typeof v === "number" && v > m ? v : m), 0);
          const lvl = pollenLevel(a, max);
          if (lvl.rank > best.rank) best = { ...lvl, allergen: a };
          if (max > 0) act.push({ allergen: a, value: max, ...lvl });
        }
        act.sort((x, y) => y.rank - x.rank || y.value - x.value);
        if (!cancelled) { setWorst(best); setActive(act); }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 60 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [lat, lon, fetchPollen]);
  return { worst, active };
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
  const { worst } = useWorstPollen(lat, lon);
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
  const { active } = useWorstPollen(lat, lon);
  if (!active || active.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {active.map((a) => (
        <span
          key={a.allergen}
          className="inline-flex items-center gap-1 justify-center rounded-full text-[9px] font-semibold leading-none px-1.5 py-0.5"
          style={{
            background: `color-mix(in oklab, ${a.color} 22%, transparent)`,
            color: a.color,
            border: `1px solid color-mix(in oklab, ${a.color} 50%, transparent)`,
          }}
          title={`${ALLERGEN_NAME[a.allergen]}: ${a.label} (${a.value.toFixed(1)})`}
        >
          <AllergenGlyph allergen={a.allergen} size={10} color={a.color} />
          {a.label}
        </span>
      ))}
    </span>
  );
}
