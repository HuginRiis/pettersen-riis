import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Calendar, Cake, ScrollText, CloudSun, Sun, HelpCircle } from "lucide-react";
import { getUpcomingWeatherEvaluations } from "@/server/weather-push.functions";

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

    // 2. Birthdays — kl 08:00 Oslo på selve dagen
    const { data: birthdays } = await supabase
      .from("birthdays")
      .select("id, name, birth_date, notify_enabled, notify_recipients, notified_year")
      .eq("notify_enabled", true);
    const thisYear = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo", year: "numeric" }).format(now));
    for (const b of birthdays ?? []) {
      const [, bm, bd] = (b.birth_date as string).split("-").map(Number);
      for (const yr of [thisYear, thisYear + 1]) {
        const dateIso = `${yr}-${String(bm).padStart(2, "0")}-${String(bd).padStart(2, "0")}`;
        const notifyAt = osloLocalToUtc(dateIso, "08:00");
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

    // 5. UV prefs — daglig morgen-sjekk (08:00 Oslo som tilnærming)
    const { data: uv } = await supabase
      .from("uv_notification_prefs")
      .select("id, label, recipient, enabled")
      .eq("enabled", true);
    for (const u of uv ?? []) {
      for (let dayOffset = 0; dayOffset <= HORIZON_DAYS; dayOffset++) {
        const d = new Date(now.getTime() + dayOffset * 86400000);
        const iso = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Europe/Oslo", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(d);
        const at = osloLocalToUtc(iso, "08:00");
        if (at < now) continue;
        result.push({
          key: `uv-${u.id}-${iso}`,
          when: at,
          source: "UV",
          icon: Sun,
          title: `UV-sjekk: ${u.label}`,
          recipients: recipientsLabel(u.recipient as string),
          detail: "ved høy UV",
        });
        break;
      }
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
          Planlagte varsler de neste {HORIZON_DAYS} dagene på tvers av agenda, bursdager, hytta, vær og UV.
        </p>

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
                        </div>
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
