import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Calendar, Cake, ScrollText, CloudSun, Sun, HelpCircle, Trash2, ShieldCheck, Newspaper, Apple, Wine, Milk, AlertTriangle, Recycle, Zap, Lightbulb } from "lucide-react";

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

export function UpcomingPushPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

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
          icon: Sun,
          title: `${u.label} — UV-varsel`,
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

  const grouped = useMemo(() => {
    const out: Record<string, Item[]> = {};
    for (const it of items) {
      const key = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(it.when);
      (out[key] ||= []).push(it);
    }
    return out;
  }, [items]);

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
