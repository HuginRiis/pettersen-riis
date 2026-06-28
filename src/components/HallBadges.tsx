import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useHeaderBadgeSettings } from "@/hooks/use-header-badge-settings";
import { getUpcomingWeatherEvaluations } from "@/lib/weather-push.functions";
import { getUpcomingUvEvaluations } from "@/lib/uv-push.functions";
import { getGarbageOverview } from "@/lib/garbage-collection";
import { getHomeySnapshot, getHomeAlarmStatus, getDoorsLocksSnapshot } from "@/lib/homey.functions";
import { getTelemarkAlerts } from "@/lib/met-alerts.functions";
// Strava-dashboard hentes via @/lib/strava-cache (15-min delt cache).
import { getGarminOverview } from "@/lib/garmin.functions";
import { useBadgeCache } from "@/lib/badge-cache";

function osloLocalToUtc(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = fmt.formatToParts(new Date(naive));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const osloAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), 0);
  return new Date(naive - (osloAsUtc - naive));
}

function osloDateIso(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function Badge({ children, title, inline }: { children: React.ReactNode; title?: string; inline?: boolean }) {
  if (inline) {
    return (
      <span
        title={title}
        className="ml-1 min-w-[20px] h-[18px] px-1.5 rounded-full bg-primary/20 text-primary text-[10px] font-semibold inline-flex items-center justify-center border border-primary/40"
      >
        {children}
      </span>
    );
  }
  return (
    <span
      title={title}
      className="absolute top-2 right-2 z-10 min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary/90 text-primary-foreground text-[11px] font-semibold flex items-center justify-center border border-primary/60 backdrop-blur shadow"
    >
      {children}
    </span>
  );
}

/** Antall planlagte push-varsler i dag (Oslo-tid). */
export function PushTodayBadge({ inline }: { inline?: boolean } = {}) {
  const count = useBadgeCache<number>(
    "push-today-count",
    async () => {
      const now = new Date();
      const today = osloDateIso(now);
      const horizon = new Date(now.getTime() + 2 * 86400000);
      let n = 0;
      const inToday = (d: Date) => osloDateIso(d) === today && d >= now;

      try {
        const { data: agenda } = await supabase
          .from("agenda_messages")
          .select("event_date, event_time, notify_minutes_before, notified_at")
          .is("notified_at", null)
          .not("event_time", "is", null)
          .not("notify_minutes_before", "is", null)
          .gte("event_date", today);
        for (const a of agenda ?? []) {
          if (!a.event_time || a.notify_minutes_before == null) continue;
          const ev = osloLocalToUtc(a.event_date as string, (a.event_time as string).slice(0, 5));
          const at = new Date(ev.getTime() - (a.notify_minutes_before as number) * 60000);
          if (inToday(at)) n++;
        }
      } catch {}

      try {
        const { data: bSetting } = await supabase
          .from("notification_settings").select("value").eq("key", "birthday_time").maybeSingle();
        const bcfg = ((bSetting?.value as any) ?? {}) as { hour?: number; minute?: number };
        const bTime = `${String(bcfg.hour ?? 8).padStart(2, "0")}:${String(bcfg.minute ?? 0).padStart(2, "0")}`;
        const { data: birthdays } = await supabase
          .from("birthdays")
          .select("birth_date, notify_enabled, notified_year")
          .eq("notify_enabled", true);
        const yr = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric" }).format(now));
        for (const b of birthdays ?? []) {
          const [, bm, bd] = (b.birth_date as string).split("-").map(Number);
          if (b.notified_year === yr) continue;
          const at = osloLocalToUtc(`${yr}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`, bTime);
          if (inToday(at)) n++;
        }
      } catch {}

      try {
        const { data: hytta } = await supabase
          .from("hytta_checklist")
          .select("notify_at, notified_at, checked")
          .is("notified_at", null).eq("checked", false).not("notify_at", "is", null);
        for (const h of hytta ?? []) {
          const at = new Date(h.notify_at as string);
          if (inToday(at)) n++;
        }
      } catch {}

      try {
        const w = await getUpcomingWeatherEvaluations();
        for (const x of w) {
          const at = new Date(x.notifyAt);
          if (x.status !== "no-hit" && inToday(at)) n++;
        }
      } catch {}
      try {
        const u = await getUpcomingUvEvaluations();
        for (const x of u) {
          const at = new Date(x.notifyAt);
          if (x.status !== "no-hit" && inToday(at)) n++;
        }
      } catch {}

      try {
        const overview = await getGarbageOverview();
        const prefMap = new Map<number, typeof overview.prefs[number]>();
        for (const p of overview.prefs) prefMap.set(p.fraksjon_id, p);
        for (const p of overview.pickups) {
          const pref = prefMap.get(p.fraksjonId);
          if (!pref || !pref.enabled) continue;
          const [py, pm, pd] = p.date.split("-").map(Number);
          const ndUtc = new Date(Date.UTC(py, pm - 1, pd) - pref.days_before * 86400000);
          const dateIso = `${ndUtc.getUTCFullYear()}-${String(ndUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(ndUtc.getUTCDate()).padStart(2, "0")}`;
          const time = `${String(pref.notify_hour).padStart(2, "0")}:${String(pref.notify_minute).padStart(2, "0")}`;
          const at = osloLocalToUtc(dateIso, time);
          if (at > horizon) continue;
          if (inToday(at)) n++;
        }
      } catch {}

      return n;
    },
    { ttlMs: 15 * 60_000 },
  );

  if (count == null || count === 0) return null;
  return <Badge inline={inline} title={`${count} planlagte varsler i dag`}>{count}</Badge>;
}

/** Antall lys (Hue) som er tent nå. */
export function LightsOnBadge({ inline }: { inline?: boolean } = {}) {
  const text = useBadgeCache<string>(
    "lights-on-text",
    async () => {
      const snap = await getHomeySnapshot();
      if (!snap.ok) return null;
      const EXTRA: string[][] = [["garsej", "lys"], ["stålampe"], ["taklys"]];
      const lights = snap.devices.filter((d: any) => {
        const hasOn = "onoff" in d.capabilities;
        const hasDim = "dim" in d.capabilities;
        if (d.class === "light") return true;
        if (hasDim) return true;
        const nm = (d.name ?? "").toLowerCase();
        if (hasOn && EXTRA.some((toks) => toks.every((t) => nm.includes(t)))) return true;
        return false;
      });
      const lit = lights.filter((d: any) => d.capabilities["onoff"]?.value === true).length;
      return `${lit}/${lights.length}`;
    },
    { ttlMs: 10 * 60_000 },
  );
  if (!text) return null;
  return <Badge inline={inline} title={`${text} lys tent`}>💡{text}</Badge>;
}

function symbolEmoji(symbol: string | null): string {
  if (!symbol) return "—";
  if (symbol.includes("clearsky")) return "☀️";
  if (symbol.includes("fair")) return "🌤";
  if (symbol.includes("partlycloudy")) return "⛅";
  if (symbol.includes("cloudy")) return "☁️";
  if (symbol.includes("snow")) return "❄️";
  if (symbol.includes("sleet")) return "🌨";
  if (symbol.includes("rain")) return "🌧";
  if (symbol.includes("thunder")) return "⛈";
  if (symbol.includes("fog")) return "🌫";
  return "🌥";
}

/** Værsymbol for i morgen (Tollnes). */
export function TomorrowWeatherBadge({ lat, lon, inline, useGps }: { lat: number; lon: number; inline?: boolean; useGps?: boolean }) {
  const [coord, setCoord] = useState<{ lat: number; lon: number }>({ lat, lon });
  useEffect(() => {
    if (!useGps || typeof navigator === "undefined" || !navigator.geolocation) {
      setCoord({ lat, lon });
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!cancelled) setCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => { if (!cancelled) setCoord({ lat, lon }); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
    return () => { cancelled = true; };
  }, [useGps, lat, lon]);
  const key = `weather-tomorrow:${coord.lat.toFixed(3)},${coord.lon.toFixed(3)}`;
  const emoji = useBadgeCache<string>(
    key,
    async () => {
      const res = await fetch(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${coord.lat}&lon=${coord.lon}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const series = data?.properties?.timeseries ?? [];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tIso = tomorrow.toISOString().slice(0, 10);
      let best: any = null;
      let bestDiff = Infinity;
      for (const e of series) {
        const t: string = e.time;
        if (!t.startsWith(tIso)) continue;
        const hour = parseInt(t.slice(11, 13));
        const diff = Math.abs(hour - 12);
        if (diff < bestDiff) { bestDiff = diff; best = e; }
      }
      const sym =
        best?.data?.next_6_hours?.summary?.symbol_code ??
        best?.data?.next_1_hours?.summary?.symbol_code ??
        null;
      return symbolEmoji(sym);
    },
    { ttlMs: 30 * 60_000 },
  );
  if (!emoji) return null;
  if (inline) {
    return (
      <span title="Værmelding i morgen" className="ml-1 text-base inline-flex items-center">
        {emoji}
      </span>
    );
  }
  return (
    <span
      title="Værmelding i morgen"
      className="absolute top-2 right-2 z-10 h-[26px] px-2 rounded-full bg-background/80 text-foreground text-base flex items-center justify-center border border-border backdrop-blur shadow"
    >
      {emoji}
    </span>
  );
}

/** Værsymbol for N dager fremover, fra valgt start (i dag eller i morgen). */
export function WeatherDaysBadge({ lat, lon, inline, useGps, startOffset = 1, days = 1, showTemp = true }: { lat: number; lon: number; inline?: boolean; useGps?: boolean; startOffset?: 0 | 1; days?: number; showTemp?: boolean }) {
  const [coord, setCoord] = useState<{ lat: number; lon: number }>({ lat, lon });
  useEffect(() => {
    if (!useGps || typeof navigator === "undefined" || !navigator.geolocation) {
      setCoord({ lat, lon });
      return;
    }
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (!cancelled) setCoord({ lat: pos.coords.latitude, lon: pos.coords.longitude }); },
      () => { if (!cancelled) setCoord({ lat, lon }); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 },
    );
    return () => { cancelled = true; };
  }, [useGps, lat, lon]);
  const key = `weather-days:${coord.lat.toFixed(3)},${coord.lon.toFixed(3)}:${startOffset}:${days}`;
  const items = useBadgeCache<{ emoji: string; temp: number | null }[]>(
    key,
    async () => {
      const res = await fetch(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${coord.lat}&lon=${coord.lon}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const series = data?.properties?.timeseries ?? [];
      const out: { emoji: string; temp: number | null }[] = [];
      for (let i = 0; i < days; i++) {
        const day = new Date();
        day.setDate(day.getDate() + startOffset + i);
        const tIso = day.toISOString().slice(0, 10);
        let best: any = null;
        let bestDiff = Infinity;
        for (const e of series) {
          const t: string = e.time;
          if (!t.startsWith(tIso)) continue;
          const hour = parseInt(t.slice(11, 13));
          const diff = Math.abs(hour - 12);
          if (diff < bestDiff) { bestDiff = diff; best = e; }
        }
        const sym = best?.data?.next_6_hours?.summary?.symbol_code ?? best?.data?.next_1_hours?.summary?.symbol_code ?? null;
        const temp = typeof best?.data?.instant?.details?.air_temperature === "number" ? best.data.instant.details.air_temperature : null;
        out.push({ emoji: symbolEmoji(sym), temp });
      }
      return out;
    },
    { ttlMs: 30 * 60_000 },
  );
  if (!items || items.length === 0) return null;
  const title = days === 1 ? (startOffset === 0 ? "Vær i dag" : "Vær i morgen") : `Vær neste ${days} dager`;
  const fmt = (t: number | null) => (t == null ? "" : `${Math.round(t)}°`);
  if (inline) {
    return (
      <span title={title} className="ml-1 inline-flex items-center gap-1 align-middle">
        {items.map((it, i) => (
          <span key={i} className="inline-flex flex-col items-center leading-none">
            <span className="text-[12px]">{it.emoji}</span>
            {showTemp && it.temp != null && <span className="text-[8px] text-muted-foreground mt-[1px]">{fmt(it.temp)}</span>}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span title={title}
      className="absolute top-2 right-2 z-10 px-1.5 py-0.5 rounded-full bg-background/80 text-foreground flex items-center justify-center border border-border backdrop-blur shadow gap-1">
      {items.map((it, i) => (
        <span key={i} className="inline-flex flex-col items-center leading-none">
          <span className="text-[12px]">{it.emoji}</span>
          {showTemp && it.temp != null && <span className="text-[8px] text-muted-foreground mt-[1px]">{fmt(it.temp)}</span>}
        </span>
      ))}
    </span>
  );
}

/** Alarm-status (AV / DELVIS / PÅ). */
export function AlarmStateBadge({ inline }: { inline?: boolean } = {}) {
  const state = useBadgeCache<"armed" | "partially_armed" | "disarmed">(
    "alarm-state",
    async () => {
      const res = await getHomeAlarmStatus();
      return res.ok && res.state ? res.state : null;
    },
    { ttlMs: 10 * 60_000 },
  );
  if (!state) return null;
  const label = state === "armed" ? "PÅ" : state === "partially_armed" ? "DELVIS" : "AV";
  const emoji = state === "armed" ? "🛡" : state === "partially_armed" ? "🛡" : "🔓";
  const tone =
    state === "armed"
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
      : state === "partially_armed"
        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
        : "bg-rose-500/20 text-rose-300 border-rose-500/40";
  if (inline) {
    return (
      <span
        title={`Alarm: ${label}`}
        className={`ml-1 px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${tone}`}
      >
        {emoji}{label}
      </span>
    );
  }
  return (
    <span
      title={`Alarm: ${label}`}
      className={`absolute top-2 right-2 z-10 h-[22px] px-2 rounded-full text-[11px] font-semibold flex items-center justify-center border backdrop-blur shadow ${tone}`}
    >
      {emoji}{label}
    </span>
  );
}

/** Antall aktive farevarsler etter alvorlighet (rød/oransje/gul). 0 vises ikke. */
export function AlertsSeverityBadge({ inline }: { inline?: boolean } = {}) {
  const counts = useBadgeCache<{ red: number; orange: number; yellow: number }>(
    "alerts-severity",
    async () => {
      const r = await getTelemarkAlerts();
      let red = 0, orange = 0, yellow = 0;
      for (const a of r.alerts ?? []) {
        if (a.riskMatrixColor === "Red") red++;
        else if (a.riskMatrixColor === "Orange") orange++;
        else if (a.riskMatrixColor === "Yellow") yellow++;
      }
      return { red, orange, yellow };
    },
    { ttlMs: 10 * 60_000 },
  );
  if (!counts) return null;
  const items: Array<{ n: number; cls: string; title: string }> = [];
  if (counts.red > 0) items.push({ n: counts.red, cls: "bg-destructive/30 text-destructive border-destructive/50", title: "Røde varsler" });
  if (counts.orange > 0) items.push({ n: counts.orange, cls: "bg-orange-500/25 text-orange-300 border-orange-500/50", title: "Oransje varsler" });
  if (counts.yellow > 0) items.push({ n: counts.yellow, cls: "bg-yellow-500/25 text-yellow-300 border-yellow-500/50", title: "Gule varsler" });
  if (items.length === 0) return null;
  return (
    <span className={inline ? "ml-1 inline-flex items-center gap-0.5" : "absolute top-2 right-2 z-10 inline-flex items-center gap-0.5"}>
      {items.map((it, i) => (
        <span
          key={i}
          title={`${it.n} ${it.title}`}
          className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${it.cls}`}
        >
          {it.n}
        </span>
      ))}
    </span>
  );
}

/** Strømforbruk i dag vs i går (Borgen + Hytta), prosent endring. */
export function PowerVsYesterdayBadge({ inline }: { inline?: boolean } = {}) {
  const pct = useBadgeCache<number>(
    "power-vs-yesterday-pct",
    async () => {
      const fmt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      const today = fmt(new Date());
      const y = new Date(); y.setDate(y.getDate() - 1);
      const yest = fmt(y);

      // I går: ferdige dagstall fra Tibber
      const { data: daily } = await supabase
        .from("tibber_daily_kwh")
        .select("day, location, kwh")
        .in("day", [today, yest]);
      let t = 0, ye = 0;
      for (const r of (daily ?? []) as Array<{ day: string; location: string; kwh: number | string }>) {
        const v = Number(r.kwh) || 0;
        if (r.day === today) t += v;
        else if (r.day === yest) ye += v;
      }

      // Hvis i dag mangler i tibber_daily_kwh (Tibber rapporterer først dagen etter),
      // bruk siste kwh_today fra Pulse-avlesninger per lokasjon.
      if (t <= 0) {
        const sinceIso = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString();
        const { data: pulse } = await supabase
          .from("pulse_readings")
          .select("location, recorded_at, kwh_today")
          .gte("recorded_at", sinceIso)
          .not("kwh_today", "is", null)
          .order("recorded_at", { ascending: false });
        const latest: Record<string, number> = {};
        for (const r of (pulse ?? []) as Array<{ location: string; recorded_at: string; kwh_today: number | null }>) {
          if (r.kwh_today == null) continue;
          const dKey = new Date(r.recorded_at).toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
          if (dKey !== today) continue;
          if (latest[r.location] == null) latest[r.location] = Number(r.kwh_today);
        }
        t = Object.values(latest).reduce((a, b) => a + b, 0);
      }

      if (ye <= 0 || t <= 0) return null;
      return ((t - ye) / ye) * 100;
    },
    { ttlMs: 5 * 60_000 },
  );

  if (pct == null || !isFinite(pct)) return null;
  const up = pct >= 0;
  const tone = up
    ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
  const txt = `${up ? "▲" : "▼"}${Math.abs(pct).toFixed(0)}%`;
  if (inline) {
    return (
      <span title={`Strøm i dag vs i går (Borgen+hytta): ${up ? "+" : ""}${pct.toFixed(1)}%`}
        className={`ml-1 px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${tone}`}>
        {txt}
      </span>
    );
  }
  return (
    <span title={`Strøm i dag vs i går: ${up ? "+" : ""}${pct.toFixed(1)}%`}
      className={`absolute top-2 right-2 z-10 h-[22px] px-2 rounded-full text-[11px] font-semibold flex items-center justify-center border backdrop-blur shadow ${tone}`}>
      {txt}
    </span>
  );
}

/** Antall treningsøkter siste 4 uker (Strava), delt opp per sport. */
export function TrainingLast4WeeksBadge({ inline, owner = "arne" }: { inline?: boolean; owner?: "arne" | "rebekka" } = {}) {
  const settings = useHeaderBadgeSettings();
  const [counts, setCounts] = useState<{ run: number; ride: number; swim: number; walk: number; hike: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const apply = (r: any) => {
      if (cancelled || !r?.ok) return;
      const t = r.totals ?? {};
      setCounts({
        run: t.recentRun?.count ?? 0,
        ride: t.recentRide?.count ?? 0,
        swim: t.recentSwim?.count ?? 0,
        walk: t.recentWalk?.count ?? 0,
        hike: t.recentHike?.count ?? 0,
      });
    };
    let unsub: (() => void) | null = null;
    (async () => {
      try {
        const { getCachedStrava, loadStrava, subscribeStrava } = await import("@/lib/strava-cache");
        const cached = getCachedStrava(owner);
        apply(cached);
        if (!cached?.ok) {
          const fresh = await loadStrava(owner);
          apply(fresh);
        }
        unsub = subscribeStrava(owner, apply);
      } catch {}
    })();
    return () => { cancelled = true; if (unsub) unsub(); };
  }, [owner]);
  if (!counts) return null;
  const initial = owner === "rebekka" ? "R" : "A";
  const tr = settings.training;
  const items: Array<{ n: number; emoji: string; label: string; cls: string }> = [];
  if (tr.run && counts.run > 0) items.push({ n: counts.run, emoji: "🏃", label: "løpeturer", cls: "bg-orange-500/20 text-orange-300 border-orange-500/40" });
  if (tr.ride && counts.ride > 0) items.push({ n: counts.ride, emoji: "🚴", label: "sykkelturer", cls: "bg-sky-500/20 text-sky-300 border-sky-500/40" });
  if (tr.swim && counts.swim > 0) items.push({ n: counts.swim, emoji: "🏊", label: "svømmeøkter", cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" });
  if (tr.walk && counts.walk > 0) items.push({ n: counts.walk, emoji: "🚶", label: "gåturer", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" });
  if (tr.hike && counts.hike > 0) items.push({ n: counts.hike, emoji: "🥾", label: "fjellturer", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" });
  if (items.length === 0) return null;
  return (
    <span className={inline ? "ml-1 inline-flex items-center gap-0.5" : "absolute top-2 right-2 z-10 inline-flex items-center gap-0.5"}>
      {items.map((it, i) => (
        <span
          key={i}
          title={`${initial}: ${it.n} ${it.label} siste 4 uker`}
          className={`min-w-[20px] h-[18px] px-1 rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${it.cls}`}
        >
          {it.emoji}{initial}{it.n}
        </span>
      ))}
    </span>
  );
}

/** Skritt i dag fra Garmin (for menyen). */
export function StepsTodayBadge({ inline, owner = "arne" }: { inline?: boolean; owner?: "arne" | "rebekka" } = {}) {
  const data = useBadgeCache<{ steps: number | null; goal: number | null }>(
    `steps-today:${owner}`,
    async () => {
      const o: any = await getGarminOverview({ data: { owner } });
      const today = o?.daily?.[o.daily.length - 1];
      if (!today) return null;
      return { steps: today.steps ?? null, goal: today.step_goal ?? null };
    },
    { ttlMs: 15 * 60_000 },
  );
  const steps = data?.steps ?? null;
  const goal = data?.goal ?? null;
  if (steps == null) return null;
  // House Stark (Arne) = slate, House Targaryen (Rebekka) = rose
  const tone = owner === "rebekka"
    ? "bg-rose-500/20 text-rose-100 border-rose-400/50"
    : "bg-slate-500/25 text-slate-100 border-slate-300/50";
  const initial = owner === "rebekka" ? "R" : "A";
  const title = goal
    ? `${initial}: ${steps.toLocaleString("nb-NO")} skritt i dag · mål ${goal.toLocaleString("nb-NO")}`
    : `${initial}: ${steps.toLocaleString("nb-NO")} skritt i dag`;
  const text = steps >= 1000 ? `${(steps / 1000).toFixed(1)}k` : String(steps);
  if (inline) {
    return (
      <span title={title}
        className={`ml-1 px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${tone}`}>
        👣{initial} {text}
      </span>
    );
  }
  return (
    <span title={title}
      className={`absolute top-2 right-2 z-10 h-[22px] px-2 rounded-full text-[11px] font-semibold flex items-center justify-center border backdrop-blur shadow ${tone}`}>
      👣{initial} {text}
    </span>
  );
}


/** Status på gressklipper(e) (Gardena Sileno via Homey). */
export function MowerStatusBadge({ inline }: { inline?: boolean } = {}) {
  const info = useBadgeCache<{ label: string; emoji: string; tone: "ok" | "warn" | "error" | "info" }>(
    "mower-status",
    async () => {
      const snap = await getHomeySnapshot();
      if (!snap.ok) return null;
      const isMower = (d: any) => {
        const n = (d.name ?? "").toLowerCase();
        const drv = (d.driverUri ?? "").toLowerCase();
        return n.includes("sileno") || n.includes("gardena") || n.includes("klipper") || n.includes("mower") ||
          drv.includes("gardena") || drv.includes("husqvarna") || drv.includes("automower");
      };
      const mowers = snap.devices.filter(isMower);
      if (mowers.length === 0) return null;
      const states = mowers.map((d: any) => {
        const cap = (id: string) => d.capabilities[id]?.value;
        const findStr = (test: (id: string) => boolean) => {
          for (const [id, c] of Object.entries<any>(d.capabilities)) {
            if (test(id.toLowerCase()) && typeof c.value === "string") return c.value as string;
          }
          return null;
        };
        const err = (typeof cap("mower_error") === "string" ? cap("mower_error") as string : null) ||
          findStr((id) => id.includes("error") && !id.includes("last"));
        const state = (typeof cap("mower_state") === "string" ? cap("mower_state") as string : null) ||
          (typeof cap("state") === "string" ? cap("state") as string : null) ||
          findStr((id) => id.includes("state"));
        const charging = typeof cap("charging") === "boolean" ? cap("charging") as boolean : null;
        return { err, state, charging };
      });
      const hasErr = states.find((s) => s.err && s.err.toLowerCase() !== "no_message");
      if (hasErr) return { label: "Feil", emoji: "⚠️", tone: "error" as const };
      const stUp = (states[0].state ?? "").toUpperCase();
      const anyMowing = states.some((s) => (s.state ?? "").toUpperCase().includes("MOW") || (s.state ?? "").toUpperCase().includes("CUTTING") || (s.state ?? "").toUpperCase().includes("LEAVING"));
      const anyCharging = states.some((s) => s.charging === true || (s.state ?? "").toUpperCase().includes("CHARGING"));
      const anyParked = states.some((s) => (s.state ?? "").toUpperCase().includes("PARK") || (s.state ?? "").toUpperCase().includes("HOME"));
      if (anyMowing) return { label: "Klipper", emoji: "🤖", tone: "ok" as const };
      if (anyCharging) return { label: "Lader", emoji: "🔌", tone: "info" as const };
      if (anyParked) return { label: "Parkert", emoji: "🅿️", tone: "info" as const };
      if (stUp) return { label: stUp.replaceAll("_", " ").toLowerCase(), emoji: "🤖", tone: "info" as const };
      return null;
    },
    { ttlMs: 10 * 60_000 },
  );
  if (!info) return null;
  const tone =
    info.tone === "ok" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
    info.tone === "warn" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
    info.tone === "error" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
    "bg-sky-500/20 text-sky-300 border-sky-500/40";
  if (inline) {
    return (
      <span title={`Gressklipper: ${info.label}`}
        className={`ml-1 px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${tone}`}>
        {info.emoji}{info.label}
      </span>
    );
  }
  return (
    <span title={`Gressklipper: ${info.label}`}
      className={`absolute top-2 right-2 z-10 h-[22px] px-2 rounded-full text-[11px] font-semibold flex items-center justify-center border backdrop-blur shadow ${tone}`}>
      {info.emoji}{info.label}
    </span>
  );
}

/** Nåværende temperatur fra MET locationforecast for gitte koordinater. */
export function CurrentTempBadge({ lat, lon, inline }: { lat: number; lon: number; inline?: boolean }) {
  const t = useBadgeCache<number>(
    `current-temp:${lat.toFixed(3)},${lon.toFixed(3)}`,
    async () => {
      const res = await fetch(
        `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) return null;
      const data = await res.json();
      const v = data?.properties?.timeseries?.[0]?.data?.instant?.details?.air_temperature;
      return typeof v === "number" ? v : null;
    },
    { ttlMs: 15 * 60_000 },
  );
  if (t == null) return null;
  // Reuse same color scale as TempBadge
  const color = (() => {
    const stops: { t: number; c: { h: number; s: number; l: number } }[] = [
      { t: -20, c: { h: 230, s: 75, l: 40 } },
      { t: 0, c: { h: 215, s: 80, l: 55 } },
      { t: 10, c: { h: 200, s: 70, l: 62 } },
      { t: 15, c: { h: 165, s: 55, l: 60 } },
      { t: 19, c: { h: 140, s: 60, l: 55 } },
      { t: 22, c: { h: 120, s: 55, l: 58 } },
      { t: 25, c: { h: 20, s: 80, l: 65 } },
      { t: 30, c: { h: 10, s: 80, l: 58 } },
      { t: 40, c: { h: 0, s: 80, l: 50 } },
    ];
    if (t <= stops[0].t) { const c = stops[0].c; return `hsl(${c.h} ${c.s}% ${c.l}%)`; }
    if (t >= stops[stops.length - 1].t) { const c = stops[stops.length - 1].c; return `hsl(${c.h} ${c.s}% ${c.l}%)`; }
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i], b = stops[i + 1];
      if (t >= a.t && t <= b.t) {
        const x = (t - a.t) / (b.t - a.t);
        const lerp = (p: number, q: number) => p + (q - p) * x;
        return `hsl(${lerp(a.c.h, b.c.h).toFixed(0)} ${lerp(a.c.s, b.c.s).toFixed(0)}% ${lerp(a.c.l, b.c.l).toFixed(0)}%)`;
      }
    }
    return `hsl(140 60% 55%)`;
  })();
  const cls = "inline-flex items-center justify-center rounded-full text-[9px] font-semibold leading-none px-1.5 py-0.5 min-w-[18px] tabular-nums";
  return (
    <span
      className={inline ? `ml-1 ${cls}` : `absolute top-2 right-2 z-10 ${cls}`}
      style={{
        background: `color-mix(in oklab, ${color} 22%, transparent)`,
        color,
        border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
      }}
      title={`Ute nå: ${t.toFixed(1)}°`}
    >
      {t.toFixed(0)}°
    </span>
  );
}

/** Neste søppeltømming: dager til + emoji dagen før. Per-fraksjon farge. */
const FRAKSJON_COLOR: Record<number, string> = {
  1: "hsl(220 10% 65%)",  // Restavfall — grå
  2: "hsl(28 65% 55%)",   // Papp — brun/oransje
  3: "hsl(140 55% 50%)",  // Matavfall — grønn
  4: "hsl(195 70% 55%)",  // Glass — blå
  5: "hsl(45 90% 55%)",   // Plast — gul
  6: "hsl(0 75% 58%)",    // Farlig — rød
  7: "hsl(165 60% 50%)",  // Papir/retur — teal
};
const FRAKSJON_EMOJI_HDR: Record<number, string> = {
  1: "🗑", 2: "📦", 3: "🥬", 4: "🍷", 5: "🥛", 6: "☣️", 7: "♻️",
};

export function GarbageNextPickupBadge({ inline }: { inline?: boolean } = {}) {
  const settings = useHeaderBadgeSettings();
  const items = useBadgeCache<Array<{ fraksjonId: number; fraksjonNavn: string; daysUntil: number }>>(
    "garbage-next-pickups",
    async () => {
      const o = await getGarbageOverview();
      const sorted = [...(o.pickups ?? [])]
        .filter((p) => p.daysUntil >= 0)
        .sort((a, b) => a.daysUntil - b.daysUntil);
      return sorted.map((p) => ({ fraksjonId: p.fraksjonId, fraksjonNavn: p.fraksjonNavn, daysUntil: p.daysUntil }));
    },
    { ttlMs: 60 * 60_000 },
  ) ?? [];
  if (items.length === 0) return null;
  const first = items[0];
  const maxDaysAhead = settings.garbage?.maxDaysAhead ?? 14;
  const showAllSameDay = settings.garbage?.showAllSameDay ?? false;
  if (first.daysUntil > maxDaysAhead) return null;
  const toShow = showAllSameDay
    ? items.filter((it) => it.daysUntil === first.daysUntil)
    : [first];
  const cls = "inline-flex items-center justify-center rounded-full text-[10px] font-semibold leading-none px-1.5 h-[18px] gap-0.5 tabular-nums";
  return (
    <>
      {toShow.map((next, idx) => {
        const color = FRAKSJON_COLOR[next.fraksjonId] ?? "hsl(220 10% 65%)";
        const emoji = FRAKSJON_EMOJI_HDR[next.fraksjonId] ?? "🗑";
        const showEmoji = next.daysUntil <= 1;
        const txt = next.daysUntil === 0 ? "i dag" : next.daysUntil === 1 ? "i morgen" : `${next.daysUntil}d`;
        const title = `Neste tømming: ${next.fraksjonNavn} ${next.daysUntil === 0 ? "i dag" : next.daysUntil === 1 ? "i morgen" : `om ${next.daysUntil} dager`}`;
        return (
          <span
            key={`${next.fraksjonId}-${idx}`}
            className={inline ? `ml-1 ${cls}` : `absolute top-2 z-10 ${cls}`}
            style={{
              background: `color-mix(in oklab, ${color} 22%, transparent)`,
              color,
              border: `1px solid color-mix(in oklab, ${color} 50%, transparent)`,
              ...(inline ? {} : { right: `${0.5 + idx * 2.5}rem` }),
            }}
            title={title}
          >
            {showEmoji && <span>{emoji}</span>}
            <span>{txt}</span>
          </span>
        );
      })}
    </>
  );
}

export function UtgangsdorenLockBadge({ inline }: { inline?: boolean } = {}) {
  const locked = useBadgeCache<boolean>(
    "utgangsdoren-lock",
    async () => {
      const r = await getDoorsLocksSnapshot({ data: {} });
      if (!r.ok) return null;
      const found =
        r.locks.find((l) => l.brand === "verisure") ??
        r.locks.find((l) => l.name.toLowerCase().includes("utgangsdør")) ??
        r.locks.find((l) => l.name.toLowerCase().includes("utgang")) ??
        null;
      if (found && typeof found.locked === "boolean") return found.locked;
      return null;
    },
    { ttlMs: 10 * 60_000 },
  );
  if (locked == null) return null;
  const label = locked ? "LÅST" : "ÅPEN";
  const emoji = locked ? "🔒" : "🔓";
  const tone = locked
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : "bg-rose-500/20 text-rose-300 border-rose-500/40";
  if (inline) {
    return (
      <span title={`Utgangsdøren: ${label}`}
        className={`ml-1 px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${tone}`}>
        {emoji}{label}
      </span>
    );
  }
  return (
    <span title={`Utgangsdøren: ${label}`}
      className={`absolute top-2 right-2 z-10 h-[22px] px-2 rounded-full text-[11px] font-semibold flex items-center justify-center border backdrop-blur shadow ${tone}`}>
      {emoji}{label}
    </span>
  );
}

/* ----------------------------- Gardena gressklipper-badges ----------------------------- */
// Ingen automatisk API-henting. Badges leser kun fra delt klient-cache som fylles
// av "Oppdater"-knappen på /gressklipper. Uten cache → ingen badge (null).
import { getCachedGardena, subscribeGardena, type GardenaSnap } from "@/lib/gardena-cache";

function useCachedGardena(): GardenaSnap | null {
  const [snap, setSnap] = useState<GardenaSnap | null>(() => getCachedGardena());
  useEffect(() => subscribeGardena(setSnap), []);
  return snap;
}

const GARDENA_ACTIVITY_LABEL: Record<string, { label: string; emoji: string; tone: "ok" | "warn" | "error" | "info" }> = {
  OK_CUTTING: { label: "Klipper", emoji: "🤖", tone: "ok" },
  OK_CUTTING_TIMER_OVERRIDDEN: { label: "Klipper", emoji: "🤖", tone: "ok" },
  OK_SEARCHING: { label: "Søker base", emoji: "🔎", tone: "info" },
  OK_LEAVING: { label: "Forlater base", emoji: "↗️", tone: "ok" },
  OK_CHARGING: { label: "Lader", emoji: "🔌", tone: "info" },
  PARKED_TIMER: { label: "Parkert", emoji: "🅿️", tone: "info" },
  PARKED_PARK_SELECTED: { label: "Parkert", emoji: "🅿️", tone: "info" },
  PARKED_AUTOTIMER: { label: "Auto-pause", emoji: "🅿️", tone: "info" },
  PAUSED: { label: "Pauset", emoji: "⏸️", tone: "warn" },
  NONE: { label: "Av", emoji: "💤", tone: "info" },
};

export function GardenaStatusBadge({ inline }: { inline?: boolean } = {}) {
  const snap = useCachedGardena();
  if (!snap?.ok || !snap.mowers?.length) return null;
  const m = snap.mowers[0];
  let info: { label: string; emoji: string; tone: "ok" | "warn" | "error" | "info" } | null = null;
  const stUp = (m.state ?? "").toUpperCase();
  if (stUp && stUp !== "OK") {
    if (stUp.includes("ERROR")) info = { label: "Feil", emoji: "⚠️", tone: "error" };
    else if (stUp.includes("WARNING")) info = { label: "Advarsel", emoji: "⚠️", tone: "warn" };
  }
  if (!info) {
    const a = GARDENA_ACTIVITY_LABEL[(m.activity ?? "").toUpperCase()];
    if (a) info = a;
    else if (m.activity) info = { label: String(m.activity).replaceAll("_", " ").toLowerCase(), emoji: "🤖", tone: "info" };
  }
  if (!info) return null;
  const tone =
    info.tone === "ok" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
    info.tone === "warn" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
    info.tone === "error" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
    "bg-sky-500/20 text-sky-300 border-sky-500/40";
  const cls = `px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${tone}`;
  return (
    <span title={`Gressklipper: ${info.label}`} className={inline ? `ml-1 ${cls}` : `absolute top-2 right-2 z-10 ${cls}`}>
      {info.emoji}{info.label}
    </span>
  );
}

export function GardenaBatteryBadge({ inline }: { inline?: boolean } = {}) {
  const snap = useCachedGardena();
  const pct = snap?.ok && snap.mowers?.length && typeof snap.mowers[0]?.battery === "number"
    ? snap.mowers[0].battery as number
    : null;
  if (pct == null) return null;
  const tone = pct >= 60
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : pct >= 25
    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
    : "bg-rose-500/20 text-rose-300 border-rose-500/40";
  const emoji = pct >= 80 ? "🔋" : pct >= 25 ? "🪫" : "⚠️";
  const cls = `px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border tabular-nums ${tone}`;
  return (
    <span title={`Batteri: ${pct}%`} className={inline ? `ml-1 ${cls}` : `absolute top-2 right-2 z-10 ${cls}`}>
      {emoji}{pct}%
    </span>
  );
}

export function GardenaSignalBadge({ inline }: { inline?: boolean } = {}) {
  const snap = useCachedGardena();
  const val = snap?.ok && snap.mowers?.length && typeof snap.mowers[0]?.rfLinkLevel === "number"
    ? snap.mowers[0].rfLinkLevel as number
    : null;
  if (val == null) return null;
  const tone = val >= 70
    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
    : val >= 40
    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
    : "bg-rose-500/20 text-rose-300 border-rose-500/40";
  const bars = val >= 25 ? "📶" : "📡";
  const cls = `px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border tabular-nums ${tone}`;
  return (
    <span title={`Signalstyrke: ${val}%`} className={inline ? `ml-1 ${cls}` : `absolute top-2 right-2 z-10 ${cls}`}>
      {bars}{val}%
    </span>
  );
}

/* ----------------------------- Roborock støvsuger-badges ----------------------------- */

let __roborockPromise: Promise<any> | null = null;
let __roborockHomeyPromise: Promise<any> | null = null;
let __roborockCachedAt = 0;
function loadRoborock(): Promise<{ cloud: any; homey: any }> {
  const now = Date.now();
  if (__roborockPromise && __roborockHomeyPromise && now - __roborockCachedAt < 60_000) {
    return Promise.all([__roborockPromise, __roborockHomeyPromise]).then(([cloud, homey]) => ({ cloud, homey }));
  }
  __roborockCachedAt = now;
  __roborockPromise = import("@/lib/roborock.functions").then((m) => m.getRoborockSnapshot()).catch(() => null);
  __roborockHomeyPromise = import("@/lib/homey.functions").then((m) => m.getRoborockHomeySnapshot()).catch(() => null);
  return Promise.all([__roborockPromise, __roborockHomeyPromise]).then(([cloud, homey]) => ({ cloud, homey }));
}

const ROBOROCK_STATE_LABEL: Record<number, string> = {
  1: "Starter", 2: "Lader", 3: "Inaktiv", 4: "Fjernstyrt", 5: "Renser",
  6: "Til dokk", 7: "Manuell", 8: "Lader", 9: "Lade-feil",
  10: "Pause", 11: "Sone-rens", 12: "Feil", 13: "Skrur av", 14: "Oppdaterer",
  15: "Dokker", 16: "Til punkt", 17: "Sone-rens", 18: "Rom-rens",
  22: "Tømmer", 23: "Vasker mopp", 26: "Vasker mopp",
};

function num(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function pickRoborockStatus(snap: { cloud: any; homey: any }, match: "hjem" | "hytt"): { label: string; emoji: string; tone: "ok" | "warn" | "error" | "info"; battery: number | null } | null {
  const matches = (name: string) => {
    const n = (name ?? "").toLowerCase();
    if (match === "hytt") return n.includes("hytt") || n.includes("bjørkeset") || n.includes("bjorkeset");
    return !(n.includes("hytt") || n.includes("bjørkeset") || n.includes("bjorkeset"));
  };

  // Cloud snapshot first (har DPS-felter)
  const cloudDev = snap.cloud?.ok ? (snap.cloud.devices ?? []).find((d: any) => matches(d.name)) : null;
  if (cloudDev) {
    const a = (cloudDev.attribute ?? {}) as Record<string, unknown>;
    const state = num(a[121]) ?? num(a.state);
    const battery = num(a[122]) ?? num(a.battery);
    const error = num(a[120]) ?? num(a.error_code);
    let tone: "ok" | "warn" | "error" | "info" = "info";
    let label = state != null ? (ROBOROCK_STATE_LABEL[state] ?? `kode ${state}`) : (cloudDev.online ? "Online" : "Offline");
    let emoji = "🤖";
    if (error && error !== 0) { tone = "error"; label = "Feil"; emoji = "⚠️"; }
    else if (state === 5 || state === 11 || state === 17 || state === 18) { tone = "ok"; emoji = "🤖"; }
    else if (state === 8 || state === 2) { tone = "info"; emoji = "🔌"; }
    else if (state === 6 || state === 15) { tone = "info"; emoji = "↩️"; }
    else if (state === 22 || state === 23 || state === 26) { tone = "info"; emoji = "🚿"; }
    else if (state === 10) { tone = "warn"; emoji = "⏸"; }
    else if (state === 12 || state === 9) { tone = "error"; emoji = "⚠️"; }
    else if (state === 3) { tone = "info"; emoji = "💤"; }
    return { label, emoji, tone, battery };
  }

  // Homey fallback
  const homeyDev = snap.homey?.ok ? (snap.homey.devices ?? []).find((d: any) => matches(d.name)) : null;
  if (homeyDev) {
    const caps: any[] = homeyDev.capabilities ?? [];
    const findCap = (pred: (id: string) => boolean) => caps.find((c) => pred(String(c.id).toLowerCase()));
    const battery = (findCap((id) => id === "measure_battery")?.value ?? null) as number | null;
    const stateCap = findCap((id) => id.includes("vacuumcleaner_state") || id === "state");
    const sv = String(stateCap?.value ?? "").toLowerCase();
    let tone: "ok" | "warn" | "error" | "info" = "info";
    let label = sv ? sv.replace(/_/g, " ") : (homeyDev.available ? "Online" : "Offline");
    let emoji = "🤖";
    if (sv.includes("clean") || sv.includes("mop")) { tone = "ok"; emoji = "🤖"; label = "Renser"; }
    else if (sv.includes("charg")) { tone = "info"; emoji = "🔌"; label = "Lader"; }
    else if (sv.includes("dock") || sv.includes("return") || sv.includes("home")) { tone = "info"; emoji = "↩️"; label = "Til dokk"; }
    else if (sv.includes("pause")) { tone = "warn"; emoji = "⏸"; label = "Pause"; }
    else if (sv.includes("error") || sv.includes("fail")) { tone = "error"; emoji = "⚠️"; label = "Feil"; }
    else if (sv.includes("idle") || sv.includes("stop")) { tone = "info"; emoji = "💤"; label = "Inaktiv"; }
    return { label, emoji, tone, battery: typeof battery === "number" ? battery : null };
  }
  return null;
}

export function RoborockStatusBadge({ inline, match, name }: { inline?: boolean; match: "hjem" | "hytt"; name: string }) {
  const info = useBadgeCache<{ label: string; emoji: string; tone: "ok" | "warn" | "error" | "info"; battery: number | null }>(
    `roborock-status:${match}`,
    async () => {
      const snap = await loadRoborock();
      return pickRoborockStatus(snap, match);
    },
    { ttlMs: 10 * 60_000 },
  );
  if (!info) return null;
  const tone =
    info.tone === "ok" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" :
    info.tone === "warn" ? "bg-amber-500/20 text-amber-300 border-amber-500/40" :
    info.tone === "error" ? "bg-rose-500/20 text-rose-300 border-rose-500/40" :
    "bg-sky-500/20 text-sky-300 border-sky-500/40";
  const cls = `px-1.5 h-[18px] rounded-full text-[10px] font-semibold inline-flex items-center justify-center border ${tone}`;
  const battTxt = info.battery != null ? ` ${info.battery}%` : "";
  return (
    <span title={`${name}: ${info.label}${battTxt}`} className={inline ? `ml-1 ${cls}` : `absolute top-2 right-2 z-10 ${cls}`}>
      {info.emoji}{name === "Hytta" ? "H" : "B"}{battTxt}
    </span>
  );
}


/** Basseng temperatur med pil for trend siste time. */
export function BassengTempBadge({ inline }: { inline?: boolean } = {}) {
  const result = useBadgeCache<{ temp: number; arrow: "up" | "down" | "flat" | null }>(
    "basseng-temp-trend",
    async () => {
      const snap = await getHomeySnapshot();
      if (!snap.ok) return null;
      const zoneById = new Map((snap.zones ?? []).map((z: any) => [z.id, z]));
      const dev = snap.devices.find((d: any) => {
        const zn = d.zone ? (zoneById.get(d.zone) as any)?.name ?? "" : "";
        const c = `${d.name} ${zn}`.toLowerCase();
        return (
          (c.includes("basseng") || c.includes("pool")) &&
          !c.includes("hytt") &&
          typeof d.capabilities["measure_temperature"]?.value === "number"
        );
      });
      if (!dev) return null;
      const temp = dev.capabilities["measure_temperature"].value as number;

      const key = "hdr.basseng.history";
      let hist: { t: number; v: number }[] = [];
      try { hist = JSON.parse(localStorage.getItem(key) ?? "[]"); } catch {}
      const now = Date.now();
      hist = hist.filter((h) => now - h.t < 3 * 3600_000);
      const last = hist[hist.length - 1];
      if (!last || now - last.t > 5 * 60_000) {
        hist.push({ t: now, v: temp });
        try { localStorage.setItem(key, JSON.stringify(hist)); } catch {}
      }
      const refTarget = now - 60 * 60_000;
      const ref = hist.reduce<{ t: number; v: number } | null>((best, h) => {
        if (now - h.t < 30 * 60_000) return best;
        if (!best) return h;
        return Math.abs(h.t - refTarget) < Math.abs(best.t - refTarget) ? h : best;
      }, null);
      let arrow: "up" | "down" | "flat" | null = null;
      if (ref) {
        const diff = temp - ref.v;
        if (diff > 0.1) arrow = "up";
        else if (diff < -0.1) arrow = "down";
        else arrow = "flat";
      }
      return { temp, arrow };
    },
    { ttlMs: 10 * 60_000 },
  );
  if (!result) return null;
  const tempTxt = `${result.temp.toFixed(1)}°`;
  const arrowChar = result.arrow === "up" ? "▲" : result.arrow === "down" ? "▼" : "";
  const arrowColor =
    result.arrow === "up" ? "text-orange-300"
    : result.arrow === "down" ? "text-sky-300"
    : "text-muted-foreground";
  const dirLabel = result.arrow === "up" ? "opp" : result.arrow === "down" ? "ned" : result.arrow === "flat" ? "stabil" : "ingen historikk";
  const title = `Basseng: ${tempTxt} (${dirLabel} siste time)`;
  if (inline) {
    return (
      <span
        title={title}
        className="ml-1 h-[18px] px-1.5 rounded-full bg-cyan-500/20 text-cyan-200 text-[10px] font-semibold inline-flex items-center gap-0.5 border border-cyan-500/40"
      >
        🏊{tempTxt}{arrowChar && <span className={arrowColor}>{arrowChar}</span>}
      </span>
    );
  }
  return (
    <span
      title={title}
      className="absolute top-2 right-2 z-10 h-[22px] px-2 rounded-full bg-cyan-500/30 text-cyan-100 text-[11px] font-semibold flex items-center gap-0.5 border border-cyan-500/50 backdrop-blur shadow"
    >
      🏊{tempTxt}{arrowChar && <span className={arrowColor}>{arrowChar}</span>}
    </span>
  );
}
