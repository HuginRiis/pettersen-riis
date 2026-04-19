import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { HouseHero } from "@/components/HouseHero";
import { useServerFn } from "@tanstack/react-start";
import { fetchVakttarnetData } from "@/server/visitors";
import type {
  VisitorSessionRow,
  LoginAttemptRow,
  PageviewRow,
} from "@/server/visitors";
import heroImg from "@/assets/hero-westeros.jpg";
import { Eye, Globe2, Smartphone, Monitor, Tablet, Clock, Crown, ShieldAlert, Map as MapIcon } from "lucide-react";

export const Route = createFileRoute("/vakttarnet")({
  head: () => ({
    meta: [
      { title: "Vakttårnet — Hvem nærmer seg porten" },
      {
        name: "description",
        content:
          "Vakttårnet ser alle som nærmer seg House Pettersen-Riis. Statistikk, kart, økter og forsøk.",
      },
      { property: "og:title", content: "Vakttårnet — House Pettersen-Riis" },
      {
        property: "og:description",
        content: "Vaktene rapporterer hver eneste sjel som krysser porten.",
      },
    ],
  }),
  component: VakttarnetPage,
});

function VakttarnetPage() {
  const fetch = useServerFn(fetchVakttarnetData);
  const [sessions, setSessions] = useState<VisitorSessionRow[]>([]);
  const [attempts, setAttempts] = useState<LoginAttemptRow[]>([]);
  const [pageviews, setPageviews] = useState<PageviewRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const data = await fetch();
        if (!alive) return;
        setSessions(data.sessions);
        setAttempts(data.attempts);
        setPageviews(data.pageviews);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const i = window.setInterval(load, 30_000);
    return () => {
      alive = false;
      window.clearInterval(i);
    };
  }, [fetch]);

  return (
    <PageShell>
      <HouseHero
        eyebrow="Husets vakt"
        title="Vakttårnet"
        subtitle="Vaktene ved muren rapporterer hver eneste sjel som nærmer seg porten."
        image={heroImg}
      />

      <section className="container mx-auto px-4 py-10 space-y-10">
        <StatsCards sessions={sessions} pageviews={pageviews} attempts={attempts} />

        <div className="grid lg:grid-cols-2 gap-6">
          <Panel
            title="Vaktens kart"
            icon={<MapIcon size={14} />}
            subtitle="Hvor sjelene befinner seg"
          >
            <VisitorMap sessions={sessions} attempts={attempts} />
          </Panel>

          <Panel
            title="Live-feed"
            icon={<Eye size={14} />}
            subtitle="Siste øyne i tårnet"
          >
            <LiveFeed sessions={sessions} loading={loading} />
          </Panel>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Panel
            title="Banker på porten"
            icon={<ShieldAlert size={14} />}
            subtitle="Login-forsøk fra fremmede og venner"
          >
            <LoginAttempts attempts={attempts} />
          </Panel>

          <Panel
            title="Topplister"
            icon={<Crown size={14} />}
            subtitle="Hvem og hva troner øverst"
          >
            <TopLists sessions={sessions} pageviews={pageviews} />
          </Panel>
        </div>
      </section>
    </PageShell>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="panel rounded-lg border border-border bg-card/60 backdrop-blur p-5">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="text-display tracking-[0.25em] text-primary uppercase text-xs">
          {title}
        </h2>
      </div>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground italic mb-4">{subtitle}</p>
      )}
      {children}
    </div>
  );
}

function StatsCards({
  sessions,
  pageviews,
  attempts,
}: {
  sessions: VisitorSessionRow[];
  pageviews: PageviewRow[];
  attempts: LoginAttemptRow[];
}) {
  const stats = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const todayCount = sessions.filter(
      (s) => new Date(s.last_seen_at).getTime() >= dayAgo,
    ).length;
    const totalSessions = sessions.length;
    const totalViews = pageviews.length;
    const avgDuration =
      sessions.length === 0
        ? 0
        : Math.round(
            sessions.reduce((acc, s) => acc + (s.duration_seconds || 0), 0) /
              sessions.length,
          );

    const pathCount = new Map<string, number>();
    for (const pv of pageviews) {
      pathCount.set(pv.path, (pathCount.get(pv.path) ?? 0) + 1);
    }
    let topPath = "—";
    let topPathHits = 0;
    for (const [p, n] of pathCount) {
      if (n > topPathHits) {
        topPath = p;
        topPathHits = n;
      }
    }

    const failedToday = attempts.filter(
      (a) => !a.success && new Date(a.attempted_at).getTime() >= dayAgo,
    ).length;

    return {
      totalSessions,
      todayCount,
      totalViews,
      avgDuration,
      topPath,
      topPathHits,
      failedToday,
    };
  }, [sessions, pageviews, attempts]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard label="Sjeler i alt" value={stats.totalSessions.toString()} />
      <StatCard label="Siste døgn" value={stats.todayCount.toString()} />
      <StatCard label="Sidevisninger" value={stats.totalViews.toString()} />
      <StatCard label="Snitt-økt" value={formatDuration(stats.avgDuration)} />
      <StatCard
        label="Mest besøkte"
        value={stats.topPath}
        sub={`${stats.topPathHits} treff`}
        wide
      />
      <StatCard
        label="Feilforsøk siste døgn"
        value={stats.failedToday.toString()}
        tone={stats.failedToday > 0 ? "warn" : "ok"}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  wide,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  wide?: boolean;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={`panel rounded-md border border-border bg-card/60 backdrop-blur p-3 ${
        wide ? "col-span-2" : ""
      }`}
    >
      <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className={`mt-1 text-display text-lg truncate ${
          tone === "warn" ? "text-destructive" : "text-primary"
        }`}
        title={value}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function VisitorMap({
  sessions,
  attempts,
}: {
  sessions: VisitorSessionRow[];
  attempts: LoginAttemptRow[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!containerRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      const map = L.map(containerRef.current, {
        zoomControl: true,
        attributionControl: false,
        scrollWheelZoom: false,
      }).setView([20, 0], 2);
      mapRef.current = map;
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        { maxZoom: 18 },
      ).addTo(map);

      const points: [number, number][] = [];

      for (const s of sessions) {
        if (s.latitude == null || s.longitude == null) continue;
        const marker = L.circleMarker([s.latitude, s.longitude], {
          radius: 6,
          color: "#c9a74a",
          fillColor: "#c9a74a",
          fillOpacity: 0.7,
          weight: 1,
        });
        const last = new Date(s.last_seen_at).toLocaleString("nb-NO");
        marker.bindPopup(
          `<div style="font-size:12px;color:#111;">
            <strong>${escapeHtml(s.city ?? "Ukjent by")}, ${escapeHtml(s.country ?? "")}</strong><br/>
            ${escapeHtml(s.device_type ?? "")} · ${escapeHtml(s.os ?? "")} · ${escapeHtml(s.browser ?? "")}<br/>
            ${s.pageview_count} sidevisninger · ${formatDuration(s.duration_seconds)}<br/>
            <em>${last}</em>
          </div>`,
        );
        marker.addTo(map);
        points.push([s.latitude, s.longitude]);
      }

      for (const a of attempts) {
        if (a.latitude == null || a.longitude == null) continue;
        const color = a.success ? "#22c55e" : "#ef4444";
        const marker = L.circleMarker([a.latitude, a.longitude], {
          radius: 5,
          color,
          fillColor: color,
          fillOpacity: 0.6,
          weight: 1,
        });
        marker.bindPopup(
          `<div style="font-size:12px;color:#111;">
            <strong>${a.success ? "Vellykket login" : "Feil passord"}</strong><br/>
            ${escapeHtml(a.city ?? "Ukjent")}, ${escapeHtml(a.country ?? "")}<br/>
            ${escapeHtml(a.device_type ?? "")} · ${escapeHtml(a.browser ?? "")}<br/>
            <em>${new Date(a.attempted_at).toLocaleString("nb-NO")}</em>
          </div>`,
        );
        marker.addTo(map);
        points.push([a.latitude, a.longitude]);
      }

      if (points.length > 0) {
        try {
          map.fitBounds(points, { padding: [30, 30], maxZoom: 6 });
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [sessions, attempts]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-md border border-border overflow-hidden"
      style={{ height: 360 }}
    />
  );
}

function LiveFeed({
  sessions,
  loading,
}: {
  sessions: VisitorSessionRow[];
  loading: boolean;
}) {
  if (loading && sessions.length === 0) {
    return <div className="text-sm text-muted-foreground">Vaktene speider…</div>;
  }
  if (sessions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Ingen sjeler har ennå nådd porten.
      </div>
    );
  }
  return (
    <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
      {sessions.slice(0, 50).map((s) => (
        <li
          key={s.id}
          className="rounded-md border border-border bg-background/40 p-3 flex items-start gap-3"
        >
          <DeviceIcon device={s.device_type} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-foreground flex items-center gap-2 flex-wrap">
              <span className="font-semibold">
                {s.city ?? "Ukjent by"}
                {s.country ? `, ${s.country}` : ""}
              </span>
              {s.country_code && (
                <span className="text-xs text-muted-foreground">
                  {flagEmoji(s.country_code)}
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {[s.device_type, s.os, s.browser].filter(Boolean).join(" · ")}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
              <span className="flex items-center gap-1">
                <Eye size={11} /> {s.pageview_count} visninger
              </span>
              <span className="flex items-center gap-1">
                <Clock size={11} /> {formatDuration(s.duration_seconds)}
              </span>
              <span>{relativeTime(s.last_seen_at)}</span>
            </div>
            {s.referrer && (
              <div
                className="text-[10px] text-muted-foreground mt-1 truncate"
                title={s.referrer}
              >
                ⇽ {s.referrer}
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function LoginAttempts({ attempts }: { attempts: LoginAttemptRow[] }) {
  if (attempts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Ingen har banket på porten ennå.
      </div>
    );
  }
  return (
    <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
      {attempts.slice(0, 80).map((a) => (
        <li
          key={a.id}
          className={`rounded-md border p-2.5 text-xs flex items-center gap-3 ${
            a.success
              ? "border-primary/30 bg-primary/5"
              : "border-destructive/30 bg-destructive/5"
          }`}
        >
          <span
            className={`text-[10px] tracking-widest uppercase font-semibold ${
              a.success ? "text-primary" : "text-destructive"
            }`}
          >
            {a.success ? "Tre inn" : "Avvist"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-foreground">
              {a.city ?? "Ukjent"}
              {a.country ? `, ${a.country}` : ""}{" "}
              {a.country_code && (
                <span className="ml-1">{flagEmoji(a.country_code)}</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {[a.device_type, a.os, a.browser].filter(Boolean).join(" · ")}
              {a.ip ? ` · ${a.ip}` : ""}
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground whitespace-nowrap">
            {relativeTime(a.attempted_at)}
          </div>
        </li>
      ))}
    </ul>
  );
}

function TopLists({
  sessions,
  pageviews,
}: {
  sessions: VisitorSessionRow[];
  pageviews: PageviewRow[];
}) {
  const lists = useMemo(() => {
    const byDevice = countBy(sessions, (s) => s.device_type ?? "Ukjent");
    const byBrowser = countBy(sessions, (s) => s.browser ?? "Ukjent");
    const byOs = countBy(sessions, (s) => s.os ?? "Ukjent");
    const byCity = countBy(sessions, (s) => {
      const c = s.city ?? "Ukjent";
      return s.country ? `${c}, ${s.country}` : c;
    });
    const byHour = new Array(24).fill(0) as number[];
    for (const pv of pageviews) {
      const h = new Date(pv.entered_at).getHours();
      byHour[h]++;
    }
    const byPath = countBy(pageviews, (p) => p.path);

    return { byDevice, byBrowser, byOs, byCity, byHour, byPath };
  }, [sessions, pageviews]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
      <RankList title="Enheter" entries={lists.byDevice.slice(0, 5)} />
      <RankList title="Nettlesere" entries={lists.byBrowser.slice(0, 5)} />
      <RankList title="Operativsystem" entries={lists.byOs.slice(0, 5)} />
      <RankList title="Byer" entries={lists.byCity.slice(0, 5)} />
      <RankList title="Mest besøkte sider" entries={lists.byPath.slice(0, 5)} />
      <HourChart hours={lists.byHour} />
    </div>
  );
}

function RankList({ title, entries }: { title: string; entries: [string, number][] }) {
  const max = entries.reduce((m, [, n]) => Math.max(m, n), 1);
  return (
    <div>
      <div className="text-[10px] tracking-[0.25em] text-primary uppercase mb-2">
        {title}
      </div>
      {entries.length === 0 ? (
        <div className="text-muted-foreground italic">Ingen data ennå</div>
      ) : (
        <ul className="space-y-1">
          {entries.map(([k, n]) => (
            <li key={k} className="flex items-center gap-2">
              <span className="flex-1 truncate text-foreground" title={k}>
                {k}
              </span>
              <span className="text-muted-foreground tabular-nums">{n}</span>
              <span className="w-16 h-1.5 rounded bg-border overflow-hidden">
                <span
                  className="block h-full bg-primary"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HourChart({ hours }: { hours: number[] }) {
  const max = Math.max(1, ...hours);
  return (
    <div className="sm:col-span-2">
      <div className="text-[10px] tracking-[0.25em] text-primary uppercase mb-2">
        Aktivitet pr. time
      </div>
      <div className="flex items-end gap-0.5 h-20">
        {hours.map((n, i) => (
          <div
            key={i}
            className="flex-1 bg-primary/70 hover:bg-primary transition-colors rounded-sm"
            style={{ height: `${(n / max) * 100}%`, minHeight: 2 }}
            title={`${i.toString().padStart(2, "0")}:00 — ${n} visninger`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
        <span>00</span>
        <span>06</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </div>
  );
}

function DeviceIcon({ device }: { device: string | null }) {
  const cls = "text-primary mt-0.5";
  if (device === "Mobil") return <Smartphone size={16} className={cls} />;
  if (device === "Nettbrett") return <Tablet size={16} className={cls} />;
  if (device === "Desktop") return <Monitor size={16} className={cls} />;
  return <Globe2 size={16} className={cls} />;
}

function countBy<T>(arr: T[], fn: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  for (const x of arr) {
    const k = fn(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}t ${mm}m`;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s siden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}t siden`;
  const d = Math.floor(h / 24);
  return `${d}d siden`;
}

function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return "";
  const A = 0x1f1e6;
  return String.fromCodePoint(
    A + cc.toUpperCase().charCodeAt(0) - 65,
    A + cc.toUpperCase().charCodeAt(1) - 65,
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}
