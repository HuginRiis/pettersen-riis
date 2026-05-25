import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Calendar, Cake, ScrollText, CloudSun, Sun, HelpCircle, Trash2, ShieldCheck, Newspaper, Apple, Wine, Milk, AlertTriangle, Recycle, Zap, Lightbulb, Activity, Mail, LogIn, Plane, Leaf, TrendingDown, TrendingUp } from "lucide-react";

const GARBAGE_ICON: Record<number, typeof Bell> = {
  1: Trash2,        // Restavfall
  2: Newspaper,     // Papir
  3: Apple,         // Matavfall
  4: Wine,          // Glass/metall
  5: Milk,          // Plast
  6: AlertTriangle, // Farlig avfall
  7: Recycle,       // Annet/plast
};
import { getUpcomingWeatherEvaluations } from "@/server/weather-push.functions";
import { getUpcomingUvEvaluations } from "@/server/uv-push.functions";
import { getGarbageOverview } from "@/server/garbage-collection";

type WeatherStatus = "will-fire" | "no-hit" | "uncertain";

type Item = {
  key: string;
  when: Date;
  source: string;
  icon: typeof Bell;
  title: string;
  recipients: string;
  detail?: string;
  rule?: string;
  status?: WeatherStatus;
};

const HORIZON_DAYS = 31;

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
  const offsetMs = osloAsUtc - naive;
  return new Date(naive - offsetMs);
}

function fmtWhen(d: Date): string {
  return d.toLocaleString("nb-NO", {
    timeZone: "Europe/Oslo",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recipientsLabel(arr: string[] | string | null | undefined): string {
  if (!arr) return "Alle";
  if (typeof arr === "string") return arr;
  if (arr.length === 0) return "Alle";
  return arr.join(", ");
}

const LS_BADGES = "upcomingPush.showBadges";
const LS_ONLY_TODAY = "upcomingPush.onlyToday";

function readBool(key: string, def: boolean): boolean {
  if (typeof window === "undefined") return def;
  const v = window.localStorage.getItem(key);
  return v == null ? def : v === "1";
}

function osloDateKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

export function UpcomingPushPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBadges, setShowBadges] = useState<boolean>(() => readBool(LS_BADGES, true));
  const [onlyToday, setOnlyToday] = useState<boolean>(() => readBool(LS_ONLY_TODAY, false));

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_BADGES, showBadges ? "1" : "0");
  }, [showBadges]);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(LS_ONLY_TODAY, onlyToday ? "1" : "0");
  }, [onlyToday]);

  useEffect(() => {
    void load();
  }, []);


  async function load() {
    setLoading(true);
    const now = new Date();
    const horizon = new Date(now.getTime() + HORIZON_DAYS * 86400000);
    const todayIso = now.toISOString().slice(0, 10);
    const result: Item[] = [];

    // 1. Agenda messages
    const { data: agenda } = await supabase
      .from("agenda_messages")
      .select("id, subject, event_date, event_time, who, notify_minutes_before, notified_at")
      .is("notified_at", null)
      .not("event_time", "is", null)
      .not("notify_minutes_before", "is", null)
      .gte("event_date", todayIso);
    for (const a of agenda ?? []) {
      if (!a.event_time || a.notify_minutes_before == null) continue;
      const eventUtc = osloLocalToUtc(a.event_date as string, (a.event_time as string).slice(0, 5));
      const notifyAt = new Date(eventUtc.getTime() - (a.notify_minutes_before as number) * 60000);
      if (notifyAt >= now && notifyAt <= horizon) {
        result.push({
          key: `agenda-${a.id}`,
          when: notifyAt,
          source: "Agenda",
          icon: Calendar,
          title: a.subject as string,
          recipients: recipientsLabel(a.who as string),
          detail: `${a.notify_minutes_before} min før`,
        });
      }
    }

    // 2. Birthdays — globalt klokkeslett (default 08:00 Oslo)
    const { data: bSetting } = await supabase
      .from("notification_settings")
      .select("value")
      .eq("key", "birthday_time")
      .maybeSingle();
    const bcfg = ((bSetting?.value as any) ?? {}) as { hour?: number; minute?: number };
    const bHour = typeof bcfg.hour === "number" ? bcfg.hour : 8;
    const bMin = typeof bcfg.minute === "number" ? bcfg.minute : 0;
    const bTime = `${String(bHour).padStart(2, "0")}:${String(bMin).padStart(2, "0")}`;

    const { data: birthdays } = await supabase
      .from("birthdays")
      .select("id, name, birth_date, notify_enabled, notify_recipients, notified_year")
      .eq("notify_enabled", true);
    const thisYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric" }).format(now));
    for (const b of birthdays ?? []) {
      const [, bm, bd] = (b.birth_date as string).split("-").map(Number);
      for (const yr of [thisYear, thisYear + 1]) {
        const dateIso = `${yr}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
        const notifyAt = osloLocalToUtc(dateIso, bTime);
        if (notifyAt < now || notifyAt > horizon) continue;
        if (b.notified_year === yr) continue;
        result.push({
          key: `birthday-${b.id}-${yr}`,
          when: notifyAt,
          source: "Bursdag",
          icon: Cake,
          title: `${b.name} fyller år`,
          recipients: recipientsLabel(b.notify_recipients as string[]),
        });
        break;
      }
    }

    // 3. Hytta huskeliste
    const { data: hytta } = await supabase
      .from("hytta_checklist")
      .select("id, label, notify_at, notify_who, notified_at, checked")
      .is("notified_at", null)
      .eq("checked", false)
      .not("notify_at", "is", null);
    const seenHyttaTrigger = new Set<string>();
    for (const h of hytta ?? []) {
      const at = new Date(h.notify_at as string);
      if (at < now || at > horizon) continue;
      const key = `${at.toISOString()}-${h.notify_who}`;
      if (seenHyttaTrigger.has(key)) continue;
      seenHyttaTrigger.add(key);
      result.push({
        key: `hytta-${h.id}`,
        when: at,
        source: "Hytta huskeliste",
        icon: ScrollText,
        title: "Påminnelse: huskeliste",
        recipients: recipientsLabel(h.notify_who as string),
      });
    }

    // 4. Weather prefs — bruk server-evaluering for å sjekke prognosen
    try {
      const weatherEvals = await getUpcomingWeatherEvaluations();
      for (const w of weatherEvals) {
        const at = new Date(w.notifyAt);
        if (at < now || at > horizon) continue;
        // Filtrer bort 'no-hit' (kun vis det som faktisk vil utløse eller er usikkert)
        if (w.status === "no-hit") continue;
        const targetLabel = new Date(w.targetDate).toLocaleDateString("nb-NO", { weekday: "short", day: "2-digit", month: "short" });
        let detail = `Gjelder ${targetLabel}`;
        if (w.status === "will-fire" && w.value != null) {
          detail += ` • prognose ${w.value.toFixed(1)} ${w.unit}`;
        } else if (w.status === "uncertain") {
          detail += " • usikker (prognose ikke tilgjengelig ennå)";
        }
        result.push({
          key: w.id,
          when: at,
          source: "Vær",
          icon: CloudSun,
          title: w.label,
          recipients: recipientsLabel(w.recipient),
          detail,
          rule: w.ruleText,
          status: w.status,
        });
      }
    } catch (err) {
      console.error("[UpcomingPushPanel] weather eval failed", err);
    }

    // 5. UV prefs — server evaluerer prognose for de neste 3 dagene
    try {
      const uvEvals = await getUpcomingUvEvaluations();
      for (const u of uvEvals) {
        const at = new Date(u.notifyAt);
        if (at < now || at > horizon) continue;
        if (u.status === "no-hit") continue;
        const targetLabel = new Date(u.targetDate).toLocaleDateString("nb-NO", { weekday: "short", day: "2-digit", month: "short" });
        let detail = `Gjelder ${targetLabel}`;
        if (u.status === "will-fire" && u.uvMax != null) {
          detail += ` • maks UV ${u.uvMax.toFixed(1)}`;
          if (u.uvMaxAt) {
            const maxTime = new Date(u.uvMaxAt).toLocaleTimeString("nb-NO", { timeZone: "Europe/Oslo", hour: "2-digit", minute: "2-digit" });
            detail += ` kl ${maxTime}`;
          }
        } else if (u.status === "uncertain") {
          detail += " • usikker (prognose ikke tilgjengelig ennå)";
        }
        result.push({
          key: `uv-${u.id}`,
          when: at,
          source: "UV",
          icon: u.kind === "fall" ? TrendingDown : Sun,
          title: u.kind === "fall"
            ? `${u.label} — UV under ${u.threshold ?? "?"}`
            : `${u.label} — UV-varsel`,
          recipients: recipientsLabel(u.recipient),
          detail,
          rule: u.ruleText,
          status: u.status,
        });
      }
    } catch (err) {
      console.error("[UpcomingPushPanel] uv eval failed", err);
    }

    // 6. Søppel/renovasjon — beregn varselstidspunkt fra prefs + neste tømminger
    try {
      const overview = await getGarbageOverview();
      const prefMap = new Map<number, typeof overview.prefs[number]>();
      for (const p of overview.prefs) prefMap.set(p.fraksjon_id, p);
      const seen = new Set<string>();
      for (const pickup of overview.pickups) {
        const pref = prefMap.get(pickup.fraksjonId);
        if (!pref || !pref.enabled) continue;
        const [py, pm, pd] = pickup.date.split("-").map(Number);
        const notifyDateMs = Date.UTC(py, pm - 1, pd) - pref.days_before * 86400000;
        const ndUtc = new Date(notifyDateMs);
        const dateIso = `${ndUtc.getUTCFullYear()}-${String(ndUtc.getUTCMonth() + 1).padStart(2, "0")}-${String(ndUtc.getUTCDate()).padStart(2, "0")}`;
        const time = `${String(pref.notify_hour).padStart(2, "0")}:${String(pref.notify_minute).padStart(2, "0")}`;
        const at = osloLocalToUtc(dateIso, time);
        if (at < now || at > horizon) continue;
        const key = `garbage-${pickup.fraksjonId}-${pickup.date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const dayLabel = pref.days_before === 0 ? "i dag" : pref.days_before === 1 ? "i morgen" : `om ${pref.days_before} dager`;
        result.push({
          key,
          when: at,
          source: "Renovasjon",
          icon: GARBAGE_ICON[pickup.fraksjonId] ?? Trash2,
          title: `${pickup.fraksjonNavn} hentes ${dayLabel}`,
          recipients: recipientsLabel(pref.who),
          detail: `Tømming ${pickup.date}`,
        });
      }
    } catch (err) {
      console.error("[UpcomingPushPanel] garbage eval failed", err);
    }

    // 7. Garanti (kvitteringer) — 30/60/90 dager før 1-års garantiutløp
    try {
      const { data: receipts } = await supabase
        .from("receipts")
        .select("id, store, purchased_at, warranty_recipient, warranty_notified_30, warranty_notified_60, warranty_notified_90")
        .not("purchased_at", "is", null);
      const { data: gPrefs } = await supabase.from("warranty_global_prefs").select("*");
      const gMap = new Map<string, any>();
      for (const g of gPrefs ?? []) gMap.set((g as any).recipient, g);

      for (const r of receipts ?? []) {
        const recipient = (r.warranty_recipient as string) || "Arne";
        const gp = gMap.get(recipient) ?? { notify_30: true, notify_60: true, notify_90: true };
        const [py, pm, pd] = (r.purchased_at as string).split("-").map(Number);
        const expiryUtc = Date.UTC(py + 1, pm - 1, pd);
        const stages = [
          { d: 90, sent: r.warranty_notified_90, on: gp.notify_90 },
          { d: 60, sent: r.warranty_notified_60, on: gp.notify_60 },
          { d: 30, sent: r.warranty_notified_30, on: gp.notify_30 },
        ];
        for (const s of stages) {
          if (!s.on || s.sent) continue;
          const at = new Date(expiryUtc - s.d * 86400000);
          if (at < now || at > horizon) continue;
          result.push({
            key: `warranty-${r.id}-${s.d}`,
            when: at,
            source: "Garanti",
            icon: ShieldCheck,
            title: `${(r.store as string) || "Kvittering"} — ${s.d} dager til garantislutt`,
            recipients: recipient,
          });
        }
      }
    } catch (err) {
      console.error("[UpcomingPushPanel] warranty eval failed", err);
    }

    result.sort((a, b) => a.when.getTime() - b.when.getTime());
    setItems(result);
    setLoading(false);
  }

  const todayKey = useMemo(() => osloDateKey(new Date()), []);
  const grouped = useMemo(() => {
    const out: Record<string, Item[]> = {};
    for (const it of items) {
      const key = osloDateKey(it.when);
      if (onlyToday && key !== todayKey) continue;
      (out[key] ||= []).push(it);
    }
    return out;
  }, [items, onlyToday, todayKey]);

  return (
    <section className="container mx-auto px-4 pb-12">
      <div className="panel rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-primary" />
            <h2 className="text-xl text-primary">Kommende push-varslinger</h2>
          </div>
          <button
            onClick={load}
            className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary transition"
          >
            Oppdater
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Planlagte varsler de neste {HORIZON_DAYS} dagene på tvers av agenda, bursdager, hytta, vær, UV, renovasjon og garanti.
        </p>
        <EventBasedRules />

        {loading && <p className="text-sm text-muted-foreground">Henter planlagte varsler…</p>}
        {!loading && items.length === 0 && (
          <p className="text-sm text-muted-foreground italic">Ingen planlagte push de neste {HORIZON_DAYS} dagene.</p>
        )}

        <ul className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
          {Object.entries(grouped).map(([day, list]) => (
            <li key={day}>
              <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-1.5 mt-2">
                {new Date(day).toLocaleDateString("nb-NO", { weekday: "long", day: "2-digit", month: "long" })}
              </div>
              <ul className="space-y-1.5">
                {list.map((it) => {
                  const Icon = it.icon;
                  return (
                    <li key={it.key} className="flex items-start gap-3 panel rounded p-3">
                      <Icon size={16} className="text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{it.title}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{it.source}</span>
                          {it.status === "uncertain" && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/50 text-amber-500 flex items-center gap-1">
                              <HelpCircle size={10} /> Usikker
                            </span>
                          )}
                          {it.status === "will-fire" && (
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-primary/50 text-primary">
                              Vil utløse
                            </span>
                          )}
                        </div>
                        {it.rule && (
                          <p className="text-[11px] text-primary/80 mt-0.5">Regel: {it.rule}</p>
                        )}
                        <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                          {fmtWhen(it.when)} • Til {it.recipients}
                          {it.detail ? ` • ${it.detail}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

type RuleRow = {
  key: string;
  icon: typeof Bell;
  source: string;
  title: string;
  detail?: string;
  recipients: string;
  enabled: boolean;
};

function EventBasedRules() {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const out: RuleRow[] = [];

    // MET farevarsel-regler
    try {
      const { data } = await supabase
        .from("met_alert_notification_prefs" as never)
        .select("id, recipient, counties, colors, min_color, event_types, enabled");
      for (const r of (data ?? []) as Array<{
        id: string; recipient: string; counties: string[]; colors: string[] | null;
        min_color: string; event_types: string[]; enabled: boolean;
      }>) {
        const colors = (r.colors && r.colors.length > 0) ? r.colors : [r.min_color];
        const sector = r.counties.length === 0 ? "Hele landet" : r.counties.join(", ");
        const types = r.event_types.length === 0 ? "alle typer" : `${r.event_types.length} typer`;
        out.push({
          key: `met-${r.id}`,
          icon: AlertTriangle,
          source: "Vær farevarsel",
          title: `MET — ${colors.join("/")}`,
          detail: `${sector} • ${types}`,
          recipients: r.recipient || "Alle",
          enabled: r.enabled,
        });
      }
    } catch (e) { console.error("[EventBasedRules] met alert prefs failed", e); }

    // Lys står på lenge
    try {
      const { data } = await supabase
        .from("light_idle_notification_prefs" as never)
        .select("id, recipient, scope, zone_name, no_motion_minutes, lights_on_minutes, enabled");
      for (const r of (data ?? []) as Array<{
        id: string; recipient: string; scope: string; zone_name: string | null;
        no_motion_minutes: number; lights_on_minutes: number | null; enabled: boolean;
      }>) {
        const where = r.scope === "global" ? "Alle innendørs rom" : (r.zone_name ?? "Sone");
        const detail = `${r.no_motion_minutes} min uten bevegelse${r.lights_on_minutes ? ` • lys på ${r.lights_on_minutes} min` : ""}`;
        out.push({
          key: `light-${r.id}`,
          icon: Lightbulb,
          source: "Lys står på",
          title: where,
          detail,
          recipients: r.recipient || "Alle",
          enabled: r.enabled,
        });
      }
    } catch (e) { console.error("[EventBasedRules] light prefs failed", e); }

    // Tibber daglig snapshot mangler
    try {
      const { data } = await supabase
        .from("notification_settings")
        .select("value")
        .eq("key", "tibber_missing")
        .maybeSingle();
      const v = ((data?.value as any) ?? {}) as { enabled?: boolean; hour?: number; minute?: number; recipient?: string };
      if (v && Object.keys(v).length > 0) {
        const h = typeof v.hour === "number" ? v.hour : 9;
        const m = typeof v.minute === "number" ? v.minute : 0;
        out.push({
          key: "tibber-missing",
          icon: Zap,
          source: "Tibber",
          title: "Daglig snapshot mangler",
          detail: `Sjekkes daglig kl ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`,
          recipients: v.recipient || "Alle",
          enabled: !!v.enabled,
        });
      }
    } catch (e) { console.error("[EventBasedRules] tibber pref failed", e); }

    // Garmin notification prefs (daglig sammendrag + terskler)
    try {
      const { data } = await supabase
        .from("garmin_notification_prefs" as never)
        .select("id, recipient, sender_label, garmin_owner, enabled, notify_daily, daily_time, notify_compare, compare_time, notify_step_goal, notify_low_sleep, low_sleep_hours, notify_high_resting_hr, high_rhr_bpm");
      for (const r of (data ?? []) as Array<{
        id: string; recipient: string; sender_label: string; garmin_owner: string; enabled: boolean;
        notify_daily: boolean; daily_time: string; notify_compare: boolean; compare_time: string;
        notify_step_goal: boolean; notify_low_sleep: boolean; low_sleep_hours: number;
        notify_high_resting_hr: boolean; high_rhr_bpm: number;
      }>) {
        const owner = r.garmin_owner === "rebekka" ? "Rebekka" : "Arne";
        const bits: string[] = [];
        if (r.notify_daily) bits.push(`daglig kl ${(r.daily_time || "07:30").slice(0,5)}`);
        if (r.notify_compare) bits.push(`duell kl ${(r.compare_time || "20:00").slice(0,5)}`);
        if (r.notify_step_goal) bits.push("skritt-mål");
        if (r.notify_low_sleep) bits.push(`lav søvn <${r.low_sleep_hours}t`);
        if (r.notify_high_resting_hr) bits.push(`høy hvilepuls >${r.high_rhr_bpm}`);
        out.push({
          key: `garmin-${r.id}`,
          icon: Activity,
          source: "Garmin",
          title: `${r.sender_label} — ${owner}`,
          detail: bits.join(" · ") || "Ingen triggere",
          recipients: r.recipient || "Alle",
          enabled: r.enabled,
        });
      }
    } catch (e) { console.error("[EventBasedRules] garmin prefs failed", e); }

    // Garmin terskler (egendefinerte)
    try {
      const { data } = await supabase
        .from("garmin_threshold_prefs" as never)
        .select("id, recipient, garmin_owner, enabled, label, metric, direction, threshold, cooldown_hours");
      for (const r of (data ?? []) as Array<{
        id: string; recipient: string; garmin_owner: string; enabled: boolean;
        label: string | null; metric: string; direction: "below" | "above";
        threshold: number; cooldown_hours: number;
      }>) {
        const owner = r.garmin_owner === "rebekka" ? "Rebekka" : "Arne";
        out.push({
          key: `garmin-thr-${r.id}`,
          icon: r.direction === "below" ? TrendingDown : TrendingUp,
          source: "Garmin terskel",
          title: r.label || `${owner} — ${r.metric}`,
          detail: `${r.direction === "below" ? "Under" : "Over"} ${r.threshold} · cooldown ${r.cooldown_hours}t`,
          recipients: r.recipient || "Alle",
          enabled: r.enabled,
        });
      }
    } catch (e) { console.error("[EventBasedRules] garmin thresholds failed", e); }

    // Postlevering
    try {
      const { data } = await supabase
        .from("mail_delivery_prefs")
        .select("id, recipient, enabled, notify_hour, notify_minute, days_before, postal_code");
      for (const r of data ?? []) {
        out.push({
          key: `mail-${(r as any).id}`,
          icon: Mail,
          source: "Postlevering",
          title: `Posten — ${(r as any).postal_code}`,
          detail: `${(r as any).days_before === 0 ? "Samme dag" : `${(r as any).days_before} dag(er) før`} · kl ${String((r as any).notify_hour).padStart(2,"0")}:${String((r as any).notify_minute).padStart(2,"0")}`,
          recipients: (r as any).recipient || "Alle",
          enabled: (r as any).enabled,
        });
      }
    } catch (e) { console.error("[EventBasedRules] mail prefs failed", e); }

    // Innlogginger
    try {
      const { data } = await supabase
        .from("login_notification_prefs")
        .select("id, recipient, enabled, notify_on_success, notify_on_failure");
      for (const r of data ?? []) {
        const bits: string[] = [];
        if ((r as any).notify_on_success) bits.push("vellykket");
        if ((r as any).notify_on_failure) bits.push("feilet");
        out.push({
          key: `login-${(r as any).id}`,
          icon: LogIn,
          source: "Innlogging",
          title: "Innloggingsforsøk",
          detail: bits.join(" + ") || "ingen",
          recipients: (r as any).recipient || "Alle",
          enabled: (r as any).enabled,
        });
      }
    } catch (e) { console.error("[EventBasedRules] login prefs failed", e); }

    // Flyradar
    try {
      const { data } = await supabase
        .from("flight_alert_prefs" as never)
        .select("id, airports, notify_arrivals, notify_departures, notify_radius, radius_km");
      for (const r of (data ?? []) as Array<{
        id: string; airports: string[]; notify_arrivals: boolean; notify_departures: boolean;
        notify_radius: boolean; radius_km: number;
      }>) {
        const bits: string[] = [];
        if (r.airports?.length) bits.push(`${r.airports.length} flyplass`);
        if (r.notify_arrivals) bits.push("ankomst");
        if (r.notify_departures) bits.push("avgang");
        if (r.notify_radius) bits.push(`radius ${r.radius_km}km`);
        if (bits.length === 0) continue;
        out.push({
          key: `flight-${r.id}`,
          icon: Plane,
          source: "Flyradar",
          title: "Fly-varsler",
          detail: bits.join(" · "),
          recipients: "Alle",
          enabled: true,
        });
      }
    } catch (e) { console.error("[EventBasedRules] flight prefs failed", e); }

    // Planter
    try {
      const { data } = await supabase
        .from("plants")
        .select("id, name, notify_recipient, notify_watering, notify_fertilize, notify_sensor, notify_season");
      for (const p of data ?? []) {
        const bits: string[] = [];
        if ((p as any).notify_watering) bits.push("vanning");
        if ((p as any).notify_fertilize) bits.push("gjødsling");
        if ((p as any).notify_sensor) bits.push("sensor");
        if ((p as any).notify_season) bits.push("sesong");
        if (bits.length === 0) continue;
        out.push({
          key: `plant-${(p as any).id}`,
          icon: Leaf,
          source: "Planter",
          title: (p as any).name,
          detail: bits.join(" · "),
          recipients: (p as any).notify_recipient || "Alle",
          enabled: true,
        });
      }
    } catch (e) { console.error("[EventBasedRules] plants failed", e); }

    setRows(out);
    setLoading(false);
  }

  if (!loading && rows.length === 0) return null;

  return (
    <div className="mb-4 panel rounded-lg p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 text-sm"
      >
        <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Hendelsesbaserte varsler ({rows.length}) — sendes når hendelse inntreffer
        </span>
        <span className="text-xs text-primary">{open ? "Skjul" : "Vis"}</span>
      </button>
      {open && (
        <ul className="space-y-1.5 mt-2">
          {rows.map((r) => {
            const Icon = r.icon;
            return (
              <li key={r.key} className={`flex items-start gap-3 panel rounded p-3 ${r.enabled ? "" : "opacity-50"}`}>
                <Icon size={16} className="text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{r.title}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.source}</span>
                    {!r.enabled && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                        Av
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Til {r.recipients}{r.detail ? ` • ${r.detail}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
