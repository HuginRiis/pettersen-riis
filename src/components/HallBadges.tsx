import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUpcomingWeatherEvaluations } from "@/server/weather-push.functions";
import { getUpcomingUvEvaluations } from "@/server/uv-push.functions";
import { getGarbageOverview } from "@/server/garbage-collection";
import { getHomeySnapshot } from "@/server/homey";

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
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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

        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (count == null || count === 0) return null;
  return <Badge inline={inline} title={`${count} planlagte varsler i dag`}>{count}</Badge>;
}

/** Antall lys (Hue) som er tent nå. */
export function LightsOnBadge({ inline }: { inline?: boolean } = {}) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getHomeySnapshot();
        if (!snap.ok) return;
        const lights = snap.devices.filter((d: any) => {
          if (d.class !== "light") return false;
          if (!("onoff" in d.capabilities)) return false;
          const driver = (d.driverUri ?? "").toLowerCase();
          const name = (d.name ?? "").toLowerCase();
          return driver.includes("hue") || driver.includes("philips") || name.includes("hue");
        });
        const lit = lights.filter((d: any) => d.capabilities["onoff"]?.value === true).length;
        if (!cancelled) setText(`${lit}/${lights.length}`);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);
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
export function TomorrowWeatherBadge({ lat, lon, inline }: { lat: number; lon: number; inline?: boolean }) {
  const [emoji, setEmoji] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) return;
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
          if (diff < bestDiff) {
            bestDiff = diff;
            best = e;
          }
        }
        const sym =
          best?.data?.next_6_hours?.summary?.symbol_code ??
          best?.data?.next_1_hours?.summary?.symbol_code ??
          null;
        if (!cancelled) setEmoji(symbolEmoji(sym));
      } catch {}
    })();
  }, [lat, lon]);
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
