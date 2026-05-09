import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/PageShell";
import { HouseHero } from "@/components/HouseHero";
import { useServerFn } from "@tanstack/react-start";
import { fetchVakttarnetData, releaseIpFn } from "@/server/visitors";
import type {
  VisitorSessionRow,
  LoginAttemptRow,
  PageviewRow,
} from "@/server/visitors";
import { getAiUsageStats, type AiUsageStats } from "@/server/ai-usage";
import { useAuthStatus } from "@/hooks/use-auth-status";
import heroImg from "@/assets/got-vakttarnet.jpg";
import { Eye, Globe2, Smartphone, Monitor, Tablet, Clock, Crown, ShieldAlert, Map as MapIcon, Lock, Unlock, Sparkles, DoorClosed, Users, Bell, Database, Activity } from "lucide-react";
import { DbUsagePanel } from "@/components/DbUsagePanel";
import { DoorsLocksPanel } from "@/components/DoorsLocksPanel";
import { ApiCallLogPanel } from "@/components/ApiCallLogPanel";
import { MaesterAiBudget } from "@/components/MaesterAiBudget";
import { PushSendCountsPanel } from "@/components/PushSendCountsPanel";
import { ChangelogPanel } from "@/components/ChangelogPanel";
import { VakttarnEventsPanel } from "@/components/VakttarnEventsPanel";
import { EufyInspector } from "@/components/EufyInspector";
import { UtgangsdorenPanel } from "@/components/UtgangsdorenPanel";
import { GarminStatusPanel } from "@/components/GarminStatusPanel";

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
  const fetchAi = useServerFn(getAiUsageStats);
  const [sessions, setSessions] = useState<VisitorSessionRow[]>([]);
  const [attempts, setAttempts] = useState<LoginAttemptRow[]>([]);
  const [pageviews, setPageviews] = useState<PageviewRow[]>([]);
  const [totalPageviews, setTotalPageviews] = useState<number>(0);
  const [totalSouls, setTotalSouls] = useState<number>(0);
  const [aiStats, setAiStats] = useState<AiUsageStats | null>(null);
  const [loading, setLoading] = useState(true);



  const reload = useMemo(() => {
    return async () => {
      try {
        const data = await fetch();
        setSessions(data.sessions);
        setAttempts(data.attempts);
        setPageviews(data.pageviews);
        setTotalPageviews(data.totalPageviews);
        setTotalSouls(data.totalSouls);
      } finally {
        setLoading(false);
      }
    };
  }, [fetch]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [data, ai] = await Promise.all([fetch(), fetchAi()]);
        if (!alive) return;
        setSessions(data.sessions);
        setAttempts(data.attempts);
        setPageviews(data.pageviews);
        setTotalPageviews(data.totalPageviews);
        setTotalSouls(data.totalSouls);
        setAiStats(ai);
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
  }, [fetch, fetchAi]);

  return (
    <PageShell>
      <HouseHero
        eyebrow="Husets vakt"
        title="Vakttårnet"
        subtitle="Vaktene ved muren rapporterer hver eneste sjel som nærmer seg porten."
        image={heroImg}
      />

      <section className="container mx-auto px-3 sm:px-4 py-6 sm:py-10 space-y-6 sm:space-y-10">
        <VakttarnetTOC />

        <section id="vt-utgangsdoren" className="scroll-mt-24"><UtgangsdorenPanel /></section>

        <section id="vt-stats" className="scroll-mt-24">
          <StatsCards
            sessions={sessions}
            pageviews={pageviews}
            attempts={attempts}
            totalPageviews={totalPageviews}
            totalSouls={totalSouls}
          />
        </section>

        <section id="vt-doors" className="scroll-mt-24">
          <Panel
            title="Borgens porter og låser"
            icon={<DoorClosed size={14} />}
            subtitle="Yale Doorman og Verisure rapporterer hva som er åpent og lukket"
          >
            <DoorsLocksPanel />
          </Panel>
        </section>

        <section id="vt-push" className="scroll-mt-24">
          <Panel
            title="Sendte varslinger"
            icon={<Bell size={14} />}
            subtitle="Hvor mange push-varslinger hver sjel har mottatt — i dag, siste uke, siste måned og totalt"
          >
            <PushSendCountsPanel />
          </Panel>
        </section>

        <section id="vt-ai-budget" className="scroll-mt-24">
          <Panel
            title="AI-skattkammeret"
            icon={<Sparkles size={14} />}
            subtitle="Hærmesterens forbruk av AI-credits — denne måned, totalt og per funksjon"
          >
            <MaesterAiBudget />
          </Panel>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <section id="vt-map" className="scroll-mt-24 contents">
            <Panel
              title="Vaktens kart"
              icon={<MapIcon size={14} />}
              subtitle="Hvor sjelene befinner seg"
              collapsible
              defaultOpen={false}
            >
              <VisitorMap sessions={sessions} attempts={attempts} />
            </Panel>
          </section>

          <section id="vt-livefeed" className="scroll-mt-24 contents">
            <Panel
              title="Live-feed"
              icon={<Eye size={14} />}
              subtitle="Siste øyne i tårnet"
              collapsible
              defaultOpen={false}
            >
              <LiveFeed sessions={sessions} loading={loading} />
            </Panel>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <section id="vt-attempts" className="scroll-mt-24 contents">
            <Panel
              title="Banker på porten"
              icon={<ShieldAlert size={14} />}
              subtitle="Login-forsøk fra fremmede og venner"
              collapsible
              defaultOpen={false}
            >
              <LoginAttempts attempts={attempts} />
            </Panel>
          </section>

          <section id="vt-lockouts" className="scroll-mt-24 contents">
            <Panel
              title="Stengte porter"
              icon={<Lock size={14} />}
              subtitle="IP-er som ble låst ute — slipp løs hestene for å frigi dem"
            >
              <Lockouts attempts={attempts} onReleased={reload} />
            </Panel>
          </section>
        </div>

        <section id="vt-toplist" className="scroll-mt-24">
          <Panel
            title="Topplister"
            icon={<Crown size={14} />}
            subtitle="Hvem og hva troner øverst"
          >
            <TopLists sessions={sessions} pageviews={pageviews} />
          </Panel>
        </section>

        <section id="vt-events" className="scroll-mt-24">
          <Panel
            title="Hvem nærmer seg porten"
            icon={<Eye size={14} />}
            subtitle="Vaktene rapporterer alle som beveger seg utenfor murene — hentet fra kameraloggen"
          >
            <VakttarnEventsPanel />
            <div className="mt-4">
              <EufyInspector />
            </div>
          </Panel>
        </section>

        <section id="vt-ai-usage" className="scroll-mt-24">
          <Panel
            title="Mesterens orakel"
            icon={<Sparkles size={14} />}
            subtitle="AI-søk, tokens og estimerte credits brukt på huset"
            collapsible
            defaultOpen={false}
          >
            <AiUsagePanel stats={aiStats} />
          </Panel>
        </section>

        <section id="vt-allvisitors" className="scroll-mt-24">
          <Panel
            title="Alle som har vært på borgen"
            icon={<Users size={14} />}
            subtitle="Husfolk og gjester — hvem, hvor mange besøk og når sist"
          >
            <AllVisitors sessions={sessions} />
          </Panel>
        </section>

        <section id="vt-db" className="scroll-mt-24">
          <Panel
            title="Database og cron-jobber"
            icon={<Database size={14} />}
            subtitle="Forbruk av Lovable Cloud, største tabeller og når neste planlagte data kommer inn"
            collapsible
            defaultOpen={false}
          >
            <DbUsagePanel />
          </Panel>
        </section>

        <section id="vt-garmin" className="scroll-mt-24">
          <Panel
            title="Garmin Connect"
            icon={<Activity size={14} />}
            subtitle="Status for tilkoblingen og siste synkronisering av helsedata"
          >
            <div className="space-y-3">
              <GarminStatusPanel owner="arne" displayName="Arne" />
              <GarminStatusPanel owner="rebekka" displayName="Rebekka" />
            </div>
          </Panel>
        </section>

        <section id="vt-apilog" className="scroll-mt-24"><ApiCallLogPanel /></section>

        <section id="vt-changelog" className="scroll-mt-24"><ChangelogPanel /></section>
      </section>
    </PageShell>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="panel rounded-lg border border-border bg-card/60 backdrop-blur p-3 sm:p-5 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        {icon && <span className="text-primary">{icon}</span>}
        <h2 className="text-display tracking-[0.25em] text-primary uppercase text-xs flex-1">
          {title}
        </h2>
        {collapsible && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[10px] tracking-widest uppercase text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded border border-border/60"
            aria-expanded={open}
          >
            {open ? "Lukk" : "Åpne"}
          </button>
        )}
      </div>
      {subtitle && (
        <p className="text-[11px] text-muted-foreground italic mb-3 sm:mb-4">{subtitle}</p>
      )}
      {(!collapsible || open) && children}
    </div>
  );
}

function StatsCards({
  sessions,
  pageviews,
  attempts,
  totalPageviews,
  totalSouls,
}: {
  sessions: VisitorSessionRow[];
  pageviews: PageviewRow[];
  attempts: LoginAttemptRow[];
  totalPageviews: number;
  totalSouls: number;
}) {
  const stats = useMemo(() => {
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    // Sjeler siste døgn — deduplisert per IP/client_session_id, samme logikk
    // som forsiden bruker.
    const soulKey = (s: VisitorSessionRow) =>
      s.ip && s.ip.length > 0 ? `ip:${s.ip}` : `cs:${s.client_session_id}`;
    const todaySouls = new Set<string>();
    for (const s of sessions) {
      if (new Date(s.last_seen_at).getTime() >= dayAgo) {
        todaySouls.add(soulKey(s));
      }
    }
    const todayCount = todaySouls.size;
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
      todayCount,
      avgDuration,
      topPath,
      topPathHits,
      failedToday,
    };
  }, [sessions, pageviews, attempts]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      <StatCard label="Unike sjeler" value={totalSouls.toLocaleString("nb-NO")} />
      <StatCard label="Sjeler siste døgn" value={stats.todayCount.toString()} />
      <StatCard label="Sidevisninger" value={totalPageviews.toLocaleString("nb-NO")} />
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
      className="w-full rounded-md border border-border overflow-hidden h-[260px] sm:h-[320px] lg:h-[360px]"
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

// ───────────────────────── Lockouts ─────────────────────────
// Mirrors the escalation logic in src/server/auth.ts so the dashboard
// shows exactly which IPs got locked out, when, and for how long.
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MIN = 15;
const ESCALATION_LOOKBACK_HOURS = 24;
const LOCKOUT_DURATIONS_MIN = [1, 15, 60] as const;

type LockoutEpisode = {
  ip: string;
  triggeredAt: Date;
  unlockAt: Date;
  durationMin: number;
  tier: number; // 0,1,2 (1 min / 15 min / 60 min)
  failuresInWindow: number;
  lastAttempt: LoginAttemptRow;
};

function detectIpEpisodes(failuresAsc: Date[]): { triggerIdx: number; tier: number; count: number }[] {
  const episodes: { triggerIdx: number; tier: number; count: number }[] = [];
  const windowMs = LOCKOUT_WINDOW_MIN * 60 * 1000;
  let i = 0;
  while (i < failuresAsc.length) {
    const windowEnd = failuresAsc[i]!.getTime() + windowMs;
    let j = i;
    while (j < failuresAsc.length && failuresAsc[j]!.getTime() <= windowEnd) j++;
    const count = j - i;
    if (count >= LOCKOUT_THRESHOLD) {
      const triggerIdx = i + LOCKOUT_THRESHOLD - 1;
      const tier = Math.min(episodes.length, LOCKOUT_DURATIONS_MIN.length - 1);
      episodes.push({ triggerIdx, tier, count });
      i = j;
    } else {
      i++;
    }
  }
  return episodes;
}

function computeLockouts(attempts: LoginAttemptRow[]): LockoutEpisode[] {
  const lookbackMs = ESCALATION_LOOKBACK_HOURS * 60 * 60 * 1000;
  const cutoff = Date.now() - lookbackMs;
  // Group failed attempts by IP, keep originals so we can show metadata
  const byIp = new Map<string, LoginAttemptRow[]>();
  for (const a of attempts) {
    if (a.success || !a.ip) continue;
    if (new Date(a.attempted_at).getTime() < cutoff) continue;
    const list = byIp.get(a.ip) ?? [];
    list.push(a);
    byIp.set(a.ip, list);
  }

  const episodes: LockoutEpisode[] = [];
  for (const [ip, list] of byIp) {
    // Ensure ascending order
    list.sort(
      (a, b) =>
        new Date(a.attempted_at).getTime() - new Date(b.attempted_at).getTime(),
    );
    const dates = list.map((r) => new Date(r.attempted_at));
    const eps = detectIpEpisodes(dates);
    for (const ep of eps) {
      const triggerRow = list[ep.triggerIdx]!;
      const triggeredAt = new Date(triggerRow.attempted_at);
      const durationMin = LOCKOUT_DURATIONS_MIN[ep.tier]!;
      episodes.push({
        ip,
        triggeredAt,
        unlockAt: new Date(triggeredAt.getTime() + durationMin * 60 * 1000),
        durationMin,
        tier: ep.tier,
        failuresInWindow: ep.count,
        lastAttempt: triggerRow,
      });
    }
  }

  // Newest first
  episodes.sort((a, b) => b.triggeredAt.getTime() - a.triggeredAt.getTime());
  return episodes;
}

function Lockouts({
  attempts,
  onReleased,
}: {
  attempts: LoginAttemptRow[];
  onReleased?: () => void | Promise<void>;
}) {
  const episodes = useMemo(() => computeLockouts(attempts), [attempts]);
  const [now, setNow] = useState(() => Date.now());
  const [releasingIp, setReleasingIp] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const release = useServerFn(releaseIpFn);
  const { authenticated } = useAuthStatus();
  const isAuthed = authenticated === true;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleRelease = async (ip: string) => {
    setReleasingIp(ip);
    setReleaseError(null);
    try {
      await release({ data: { ip } });
      if (onReleased) await onReleased();
    } catch (err) {
      setReleaseError(err instanceof Error ? err.message : "Kunne ikke slippe løs hestene");
    } finally {
      setReleasingIp(null);
    }
  };

  if (episodes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Ingen porter har blitt stengt siste døgn.
      </div>
    );
  }

  return (
    <>
      {releaseError && (
        <div className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 text-destructive text-xs px-2.5 py-1.5">
          {releaseError}
        </div>
      )}
      <ul className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
        {episodes.map((ep, idx) => {
          const active = ep.unlockAt.getTime() > now;
          const remainingMs = ep.unlockAt.getTime() - now;
          const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
          const tierLabel =
            ep.tier === 0 ? "Første stengning" : ep.tier === 1 ? "Andre stengning" : "Tredje+ stengning";
          const isReleasing = releasingIp === ep.ip;
          return (
            <li
              key={`${ep.ip}-${ep.triggeredAt.getTime()}-${idx}`}
              className={`rounded-md border p-2.5 text-xs ${
                active
                  ? "border-destructive/50 bg-destructive/10"
                  : "border-border bg-background/40"
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] tracking-widest uppercase font-semibold ${
                    active ? "text-destructive" : "text-muted-foreground"
                  }`}
                >
                  {active ? "Stengt nå" : "Var stengt"}
                </span>
                <span className="text-[10px] tracking-widest uppercase text-primary">
                  {tierLabel}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  · {ep.durationMin} min
                </span>
                {active && (
                  <span className="text-[10px] text-destructive ml-auto">
                    ~{remainingMin} min igjen
                  </span>
                )}
              </div>
              <div className="mt-1 text-foreground font-mono text-[11px] break-all">
                {ep.ip}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {ep.lastAttempt.city ?? "Ukjent"}
                {ep.lastAttempt.country ? `, ${ep.lastAttempt.country}` : ""}
                {ep.lastAttempt.country_code && (
                  <span className="ml-1">{flagEmoji(ep.lastAttempt.country_code)}</span>
                )}
                {" · "}
                {[ep.lastAttempt.device_type, ep.lastAttempt.browser]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 flex justify-between gap-2 flex-wrap">
                <span>
                  {ep.failuresInWindow} feilforsøk · utløst{" "}
                  {relativeTime(ep.triggeredAt.toISOString())}
                </span>
                <span>
                  {active ? "Åpner" : "Åpnet"}{" "}
                  {ep.unlockAt.toLocaleTimeString("nb-NO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {isAuthed && (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleRelease(ep.ip)}
                    disabled={isReleasing}
                    className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 hover:border-primary px-2.5 py-1 text-[10px] tracking-[0.2em] uppercase text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Slett alle feilforsøk fra denne IP-en og fjern oppføringen"
                  >
                    <Unlock size={11} />
                    {isReleasing ? "Slipper løs…" : "Slipp løs hestene"}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
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
    <div className="space-y-4 text-xs">
      <HourChart hours={lists.byHour} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <RankList title="Mest besøkte sider" entries={lists.byPath.slice(0, 5)} />
      </div>
      <details className="rounded border border-border/40 bg-background/30">
        <summary className="cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[0.25em] text-primary hover:text-foreground">
          Flere topplister (enheter, nettlesere, OS, byer)
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 pt-1">
          <RankList title="Enheter" entries={lists.byDevice.slice(0, 5)} />
          <RankList title="Nettlesere" entries={lists.byBrowser.slice(0, 5)} />
          <RankList title="Operativsystem" entries={lists.byOs.slice(0, 5)} />
          <RankList title="Byer" entries={lists.byCity.slice(0, 5)} />
        </div>
      </details>
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

// ── AI-bruk ───────────────────────────────────────────────────────────
function AiUsagePanel({ stats }: { stats: AiUsageStats | null }) {
  if (!stats) {
    return <div className="text-sm text-muted-foreground">Henter orakelets logg…</div>;
  }
  if (stats.totalSearches === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Ingen har enda spurt orakelet.
      </div>
    );
  }
  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
  const fmtTokens = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <StatCard label="Søk i alt" value={stats.totalSearches.toString()} />
        <StatCard label="I dag" value={stats.searchesToday.toString()} />
        <StatCard label="Denne måneden" value={stats.searchesMonth.toString()} />
        <StatCard
          label="Tokens"
          value={fmtTokens(stats.totalTokens)}
          sub={`~${fmtUsd(stats.estimatedCostUsd)} totalt`}
        />
        <StatCard
          label="Rate-limit"
          value={stats.rateLimited.toString()}
          tone={stats.rateLimited > 0 ? "warn" : "ok"}
          sub="Avviste pga. dagsgrense"
        />
        <StatCard
          label="Innlogget vs offentlig"
          value={`${stats.authenticatedSearches} / ${stats.publicSearches}`}
          wide
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">
            Per funksjon
          </div>
          <ul className="text-xs space-y-1">
            {stats.byFeature.map((f) => (
              <li key={f.feature} className="flex justify-between gap-2">
                <span className="text-foreground">{f.feature}</span>
                <span className="text-muted-foreground">
                  {f.count} søk · ~{fmtUsd(f.costUsd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">
            Per modell
          </div>
          <ul className="text-xs space-y-1">
            {stats.byModel.map((m) => (
              <li key={m.model} className="flex justify-between gap-2">
                <span className="text-foreground truncate" title={m.model}>
                  {m.model}
                </span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {m.count} · ~{fmtUsd(m.costUsd)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {stats.topQueries.length > 0 && (
        <div className="rounded-md border border-border bg-background/40 p-3">
          <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">
            Mest stilte spørsmål
          </div>
          <ul className="text-xs space-y-1">
            {stats.topQueries.map((q) => (
              <li key={q.query} className="flex justify-between gap-2">
                <span className="text-foreground truncate" title={q.query}>
                  {q.query}
                </span>
                <span className="text-muted-foreground">{q.count}×</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-md border border-border bg-background/40 p-3">
        <div className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mb-2">
          Siste søk
        </div>
        <ul className="text-xs space-y-1 max-h-64 overflow-y-auto pr-1">
          {stats.recent.map((r) => (
            <li
              key={r.id}
              className="flex justify-between gap-2 border-b border-border/40 pb-1 last:border-0"
            >
              <span className="truncate" title={r.query ?? ""}>
                <span
                  className={`mr-2 text-[9px] uppercase tracking-widest ${
                    r.status === "ok"
                      ? "text-primary"
                      : r.status === "rate_limited"
                        ? "text-yellow-500"
                        : "text-destructive"
                  }`}
                >
                  {r.status}
                </span>
                {r.query ?? "—"}
              </span>
              <span className="text-muted-foreground whitespace-nowrap">
                {r.authenticated ? "🔓" : "🌐"}{" "}
                {new Date(r.created_at).toLocaleString("nb-NO", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-muted-foreground italic">
        Estimerte kostnader er omtrentlige (basert på Lovable AI Gateway-priser
        per modell). Eksakte credits ser du i workspace-innstillingene.
      </p>
    </div>
  );
}

// ── Alle besøkende — gruppert per sjel ───────────────────────────────
function AllVisitors({ sessions }: { sessions: VisitorSessionRow[] }) {
  type Group = {
    key: string;
    label: string;
    who: string | null;
    place: string;
    countryCode: string | null;
    visits: number;
    pageviews: number;
    durationSeconds: number;
    lastSeen: string;
    devices: Set<string>;
    online: boolean;
  };

  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const groups = useMemo(() => {
    const ONLINE_MS = 5 * 60 * 1000;
    const map = new Map<string, Group>();
    for (const s of sessions) {
      const key = s.who && s.who.length > 0
        ? `who:${s.who}`
        : s.ip && s.ip.length > 0
          ? `ip:${s.ip}`
          : `cs:${s.client_session_id}`;
      const place = [s.city, s.country].filter(Boolean).join(", ") || "Ukjent sted";
      const existing = map.get(key);
      if (existing) {
        existing.visits += 1;
        existing.pageviews += s.pageview_count || 0;
        existing.durationSeconds += s.duration_seconds || 0;
        if (new Date(s.last_seen_at) > new Date(existing.lastSeen)) {
          existing.lastSeen = s.last_seen_at;
          existing.place = place;
          existing.countryCode = s.country_code ?? existing.countryCode;
        }
        if (s.device_type) existing.devices.add(s.device_type);
      } else {
        map.set(key, {
          key,
          label: s.who ?? (s.ip ? `Gjest · ${place}` : "Anonym sjel"),
          who: s.who,
          place,
          countryCode: s.country_code,
          visits: 1,
          pageviews: s.pageview_count || 0,
          durationSeconds: s.duration_seconds || 0,
          lastSeen: s.last_seen_at,
          devices: new Set(s.device_type ? [s.device_type] : []),
          online: false,
        });
      }
    }
    // Marker online (aktive innen siste 5 min)
    for (const g of map.values()) {
      g.online = now - new Date(g.lastSeen).getTime() < ONLINE_MS;
    }
    return [...map.values()].sort((a, b) => {
      // Pålogget alltid øverst
      if (a.online !== b.online) return a.online ? -1 : 1;
      // Kjente sjeler (med navn) over gjester
      const aKnown = !!(a.who && a.who.length > 0);
      const bKnown = !!(b.who && b.who.length > 0);
      if (aKnown !== bKnown) return aKnown ? -1 : 1;
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });
  }, [sessions, now]);

  if (groups.length === 0) {
    return (
      <div className="text-sm text-muted-foreground italic">
        Ingen besøk å vise ennå.
      </div>
    );
  }

  // Pålogget er alltid synlig på toppen. Resten begrenses til 5 før utvidelse.
  const onlineGroups = groups.filter((g) => g.online);
  const offlineGroups = groups.filter((g) => !g.online);
  const offlineLimit = 5;
  const visibleOffline = expanded ? offlineGroups : offlineGroups.slice(0, offlineLimit);
  const hiddenCount = offlineGroups.length - visibleOffline.length;
  const visible = [...onlineGroups, ...visibleOffline];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground border-b border-border">
              <th className="text-left font-normal py-2 px-3">Sjel</th>
              <th className="text-left font-normal py-2 px-3 hidden sm:table-cell">Sted</th>
              <th className="text-right font-normal py-2 px-3">Besøk</th>
              <th className="text-right font-normal py-2 px-3 hidden md:table-cell">Visninger</th>
              <th className="text-right font-normal py-2 px-3 hidden md:table-cell">Tid</th>
              <th className="text-right font-normal py-2 px-3">Sist</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <tr
                key={g.key}
                className={`border-b border-border/40 last:border-0 hover:bg-background/40 ${
                  g.online ? "bg-primary/5" : ""
                }`}
              >
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    {g.online && (
                      <span
                        className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse"
                        title="Pålogget nå"
                      />
                    )}
                    {g.who ? (
                      <Crown size={12} className="text-primary shrink-0" />
                    ) : (
                      <Globe2 size={12} className="text-muted-foreground shrink-0" />
                    )}
                    <span className={g.who ? "text-primary font-semibold" : "text-foreground"}>
                      {g.label}
                    </span>
                    {g.countryCode && (
                      <span className="text-[11px]">{flagEmoji(g.countryCode)}</span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground sm:hidden mt-0.5">
                    {g.place}
                  </div>
                </td>
                <td className="py-2 px-3 hidden sm:table-cell text-muted-foreground">
                  {g.place}
                </td>
                <td className="py-2 px-3 text-right text-foreground">{g.visits}</td>
                <td className="py-2 px-3 text-right text-muted-foreground hidden md:table-cell">
                  {g.pageviews}
                </td>
                <td className="py-2 px-3 text-right text-muted-foreground hidden md:table-cell">
                  {formatDuration(g.durationSeconds)}
                </td>
                <td
                  className="py-2 px-3 text-right text-muted-foreground whitespace-nowrap"
                  title={new Date(g.lastSeen).toLocaleString("nb-NO")}
                >
                  {g.online ? (
                    <span className="text-emerald-500 font-medium">Pålogget</span>
                  ) : (
                    relativeTime(g.lastSeen)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {offlineGroups.length > offlineLimit && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] uppercase tracking-[0.2em] text-primary hover:text-primary/80 border border-primary/30 hover:border-primary/60 rounded-full px-4 py-1.5 transition-colors"
          >
            {expanded ? "Vis færre" : `Vis alle (${hiddenCount} til)`}
          </button>
        </div>
      )}
    </div>
  );
}
