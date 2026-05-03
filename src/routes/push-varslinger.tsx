import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell, PageHero } from "@/components/PageShell";
import { supabase } from "@/integrations/supabase/client";
import { UpcomingPushPanel } from "@/components/UpcomingPushPanel";
import { TibberCronStatusPanel } from "@/components/TibberCronStatusPanel";
import {
  Bell, BellOff, Calendar, Cake, Trash2, CloudSun, Sun, Lightbulb, ScrollText, ShieldCheck, Lock, ExternalLink, Smartphone, X,
} from "lucide-react";
import heroImg from "@/assets/got-agenda.jpg";

export const Route = createFileRoute("/push-varslinger")({
  head: () => ({
    meta: [
      { title: "Push-varslinger | House Pettersen Riis" },
      { name: "description", content: "Samlet oversikt og redigering av alle push-varsler i huset." },
      { property: "og:title", content: "Push-varslinger | House Pettersen Riis" },
      { property: "og:description", content: "Alle push-varsler — agenda, bursdager, vær, UV, søppel, lys, hytta og garanti — på ett sted." },
    ],
  }),
  component: PushSettingsPage,
});

type Counts = {
  agendaPending: number;
  birthdaysOn: number;
  birthdaysTotal: number;
  hyttaScheduled: number;
  weatherOn: number;
  weatherTotal: number;
  uvOn: number;
  uvTotal: number;
  lightOn: number;
  lightTotal: number;
  garbageOn: number;
  garbageTotal: number;
  warrantyPending: number;
  subscribers: number;
};

function PushSettingsPage() {
  const [counts, setCounts] = useState<Counts | null>(null);

  useEffect(() => {
    void loadCounts().then(setCounts);
  }, []);

  return (
    <PageShell>
      <PageHero
        eyebrow="Husets ravner"
        title="Push-varslinger"
        subtitle="Alle varsler huset kan sende — samlet på ett sted. Rediger her eller på sin opprinnelige side."
        image={heroImg}
      />

      <UpcomingPushPanel />
      <TibberCronStatusPanel />

      <section className="container mx-auto px-4 pb-12 grid md:grid-cols-2 gap-4">
        <CategoryCard
          icon={Calendar}
          title="Agenda-meldinger"
          editPath="/agenda"
          count={counts ? `${counts.agendaPending} planlagte` : null}
          description="Korte meldinger med dato, tid og varsling før hendelsen."
          editable
        >
          <p className="text-xs text-muted-foreground">
            Hver melding har egen mottaker og varsel-tid (5 min – 1 time før). Rediger på agenda-siden.
          </p>
        </CategoryCard>

        <CategoryCard
          icon={Cake}
          title="Bursdager"
          editPath="/agenda"
          count={counts ? `${counts.birthdaysOn} av ${counts.birthdaysTotal} aktive` : null}
          description="Sender push kl 08:00 Oslo-tid på selve bursdagen."
          editable
        />

        <BirthdaysQuickPanel />

        <CategoryCard
          icon={CloudSun}
          title="Værvarsler"
          editPath="/var"
          count={counts ? `${counts.weatherOn} av ${counts.weatherTotal} aktive` : null}
          description="Påminnelser om regn, snø, vind, kulde m.m. til valgt tid om morgenen."
          editable
        />

        <WeatherPrefsList />

        <CategoryCard
          icon={Sun}
          title="UV-varsler"
          editPath="/var"
          count={counts ? `${counts.uvOn} av ${counts.uvTotal} aktive` : null}
          description="Varsler når UV-indeks når 3, 6 og 8 — én gang per nivå per dag."
          editable
        />

        <UvPrefsList />

        <CategoryCard
          icon={Trash2}
          title="Søppeltømming"
          editPath="/agenda"
          count={counts ? `${counts.garbageOn} av ${counts.garbageTotal} fraksjoner` : null}
          description="Varsler dagen før (eller flere dager før) tømming, til valgt klokkeslett."
          editable
        />

        <GarbagePrefsList />

        <CategoryCard
          icon={Lightbulb}
          title="Lys står på lenge"
          editPath="/smarthus"
          count={counts ? `${counts.lightOn} av ${counts.lightTotal} aktive` : null}
          description="Varsler når lys i en sone har stått på uten bevegelse en stund."
          editable
        />

        <LightIdlePrefsList />

        <CategoryCard
          icon={ScrollText}
          title="Hytta — huskeliste"
          editPath="/hytta"
          count={counts ? `${counts.hyttaScheduled} planlagte påminnelser` : null}
          description="Påminnelse om åpne punkter på hyttas huskeliste til valgt tidspunkt."
          editable
        />

        <CategoryCard
          icon={ShieldCheck}
          title="Garanti — kvitteringer"
          editPath="/kvitteringer"
          count={counts ? `${counts.warrantyPending} kvitteringer venter` : null}
          description="Hardkodet: sender push 30, 60 og 90 dager før garantien (1 år) går ut."
          editable={false}
        />

        <WarrantyGlobalPrefsPanel />

        <CategoryCard
          icon={Bell}
          title="Push-abonnementer"
          editPath="/agenda"
          count={counts ? `${counts.subscribers} enheter` : null}
          description="Enheter som er registrert for å motta push fra huset."
          editable
        />

        <SubscribersListPanel />
      </section>
    </PageShell>
  );
}

async function loadCounts(): Promise<Counts> {
  const today = new Date().toISOString().slice(0, 10);
  const [
    agenda, birthdays, hytta, weather, uv, light, garbage, garbAddr, warranty, subs,
  ] = await Promise.all([
    supabase.from("agenda_messages").select("id, notify_minutes_before, notified_at, event_date").is("notified_at", null).gte("event_date", today),
    supabase.from("birthdays").select("id, notify_enabled"),
    supabase.from("hytta_checklist").select("id, notify_at, notified_at, checked").is("notified_at", null).eq("checked", false).not("notify_at", "is", null),
    supabase.from("weather_notification_prefs").select("id, enabled"),
    supabase.from("uv_notification_prefs").select("id, enabled"),
    supabase.from("light_idle_notification_prefs").select("id, enabled"),
    supabase.from("garbage_notification_prefs").select("id, enabled"),
    supabase.from("garbage_address").select("id"),
    supabase.from("receipts").select("id, purchased_at, warranty_notified_90").is("warranty_notified_90", null),
    supabase.from("push_subscriptions").select("id"),
  ]);

  return {
    agendaPending: (agenda.data ?? []).filter((a: any) => a.notify_minutes_before != null).length,
    birthdaysOn: (birthdays.data ?? []).filter((b: any) => b.notify_enabled).length,
    birthdaysTotal: birthdays.data?.length ?? 0,
    hyttaScheduled: hytta.data?.length ?? 0,
    weatherOn: (weather.data ?? []).filter((w: any) => w.enabled).length,
    weatherTotal: weather.data?.length ?? 0,
    uvOn: (uv.data ?? []).filter((u: any) => u.enabled).length,
    uvTotal: uv.data?.length ?? 0,
    lightOn: (light.data ?? []).filter((l: any) => l.enabled).length,
    lightTotal: light.data?.length ?? 0,
    garbageOn: (garbage.data ?? []).filter((g: any) => g.enabled).length,
    garbageTotal: garbAddr.data?.length ? 4 : 0, // typisk 4 fraksjoner; bare info
    warrantyPending: warranty.data?.length ?? 0,
    subscribers: subs.data?.length ?? 0,
  };
}

function CategoryCard({
  icon: Icon, title, description, editPath, count, editable, children,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
  editPath: string;
  count: string | null;
  editable: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article className="panel rounded-lg p-4">
      <div className="flex items-start gap-3">
        <Icon size={20} className="text-primary mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-foreground font-semibold">{title}</h3>
            {count && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{count}</span>}
            {!editable && (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Lock size={10} /> Hardkodet
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
          {children && <div className="mt-3">{children}</div>}
          <Link
            to={editPath}
            className="inline-flex items-center gap-1 text-xs uppercase tracking-wider text-primary hover:underline mt-3"
          >
            {editable ? "Rediger på opprinnelig side" : "Se kvitteringer"} <ExternalLink size={11} />
          </Link>
        </div>
      </div>
    </article>
  );
}

/* ---------- Inline quick-edit lists (toggle enabled / quick delete) ---------- */

function BirthdaysQuickPanel() {
  const [items, setItems] = useState<{ id: string; name: string; notify_enabled: boolean }[]>([]);
  useEffect(() => { void load(); }, []);
  async function load() {
    const { data } = await supabase.from("birthdays").select("id, name, notify_enabled").order("name");
    setItems((data as any) ?? []);
  }
  async function toggle(id: string, current: boolean) {
    await supabase.from("birthdays").update({ notify_enabled: !current }).eq("id", id);
    setItems(p => p.map(x => x.id === id ? { ...x, notify_enabled: !current } : x));
  }
  if (items.length === 0) return null;
  return (
    <article className="panel rounded-lg p-4 md:col-span-2">
      <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Bursdager — av/på</h3>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {items.map(b => (
          <li key={b.id}>
            <button
              onClick={() => toggle(b.id, b.notify_enabled)}
              className={`w-full text-left px-2.5 py-1.5 rounded border text-xs transition flex items-center gap-1.5 ${
                b.notify_enabled ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {b.notify_enabled ? <Bell size={12} /> : <BellOff size={12} />} {b.name}
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

type Pref = { id: string; label?: string | null; zone_name?: string | null; fraksjon_navn?: string | null; enabled: boolean; recipient?: string; who?: string; kind?: string };

function PrefsToggleList({ table, title, getLabel, mdSpan = true }: {
  table: "weather_notification_prefs" | "uv_notification_prefs" | "light_idle_notification_prefs" | "garbage_notification_prefs";
  title: string;
  getLabel: (p: Pref) => string;
  mdSpan?: boolean;
}) {
  const [items, setItems] = useState<Pref[]>([]);
  useEffect(() => { void load(); }, []);
  async function load() {
    const { data } = await supabase.from(table).select("*");
    setItems((data as any) ?? []);
  }
  async function toggle(id: string, current: boolean) {
    await supabase.from(table).update({ enabled: !current }).eq("id", id);
    setItems(p => p.map(x => x.id === id ? { ...x, enabled: !current } : x));
  }
  if (items.length === 0) return null;
  return (
    <article className={`panel rounded-lg p-4 ${mdSpan ? "md:col-span-2" : ""}`}>
      <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">{title}</h3>
      <ul className="space-y-1.5">
        {items.map(p => (
          <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-foreground truncate">{getLabel(p)}</span>
            <button
              onClick={() => toggle(p.id, p.enabled)}
              className={`px-2 py-1 rounded border text-xs transition flex items-center gap-1.5 shrink-0 ${
                p.enabled ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {p.enabled ? <Bell size={12} /> : <BellOff size={12} />} {p.enabled ? "På" : "Av"}
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}

const WeatherPrefsList = () => (
  <PrefsToggleList
    table="weather_notification_prefs"
    title="Værvarsler — av/på"
    getLabel={(p) => `${p.label ?? ""} • ${p.kind ?? ""} → ${p.recipient ?? "Alle"}`}
  />
);
const UvPrefsList = () => (
  <PrefsToggleList
    table="uv_notification_prefs"
    title="UV-varsler — av/på"
    getLabel={(p) => `${p.label ?? ""} → ${p.recipient ?? "Alle"}`}
  />
);
const LightIdlePrefsList = () => (
  <PrefsToggleList
    table="light_idle_notification_prefs"
    title="Lys står på — av/på"
    getLabel={(p) => `${p.zone_name ?? "Sone"} → ${p.recipient ?? "Alle"}`}
  />
);
const GarbagePrefsList = () => (
  <PrefsToggleList
    table="garbage_notification_prefs"
    title="Søppel — av/på"
    getLabel={(p) => `${p.fraksjon_navn ?? "Fraksjon"} → ${p.who ?? "Alle"}`}
  />
);

const WHO_OPTIONS = ["Alle", "Arne", "Rebekka", "Arne & Rebekka"] as const;
type WarrantyPref = { id?: string; recipient: string; notify_30: boolean; notify_60: boolean; notify_90: boolean };

function WarrantyGlobalPrefsPanel() {
  const [prefs, setPrefs] = useState<Record<string, WarrantyPref>>({});

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data } = await supabase.from("warranty_global_prefs").select("*");
    const map: Record<string, WarrantyPref> = {};
    for (const w of WHO_OPTIONS) {
      map[w] = { recipient: w, notify_30: true, notify_60: true, notify_90: true };
    }
    for (const row of (data ?? []) as WarrantyPref[]) {
      map[row.recipient] = row;
    }
    setPrefs(map);
  }

  async function toggle(who: string, field: "notify_30" | "notify_60" | "notify_90") {
    const current = prefs[who] ?? { recipient: who, notify_30: true, notify_60: true, notify_90: true };
    const next = { ...current, [field]: !current[field] };
    setPrefs(p => ({ ...p, [who]: next }));
    await supabase.from("warranty_global_prefs").upsert(
      { recipient: who, notify_30: next.notify_30, notify_60: next.notify_60, notify_90: next.notify_90 },
      { onConflict: "recipient" }
    );
  }

  return (
    <article className="panel rounded-lg p-4 md:col-span-2">
      <h3 className="text-sm uppercase tracking-wider text-muted-foreground mb-1">Garanti — globalt av/på per bruker</h3>
      <p className="text-xs text-muted-foreground mb-3">
        Skru av enkelt-milepæler (30/60/90 dager) for valgt mottaker. Gjelder alle kvitteringer.
      </p>
      <div className="space-y-2">
        {WHO_OPTIONS.map(who => {
          const p = prefs[who] ?? { recipient: who, notify_30: true, notify_60: true, notify_90: true };
          return (
            <div key={who} className="flex items-center justify-between gap-2 text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
              <span className="text-foreground font-medium">{who}</span>
              <div className="flex gap-1.5">
                {([30, 60, 90] as const).map(m => {
                  const field = `notify_${m}` as "notify_30" | "notify_60" | "notify_90";
                  const on = p[field];
                  return (
                    <button
                      key={m}
                      onClick={() => toggle(who, field)}
                      className={`px-2 py-1 rounded border text-xs transition flex items-center gap-1 ${
                        on ? "border-primary/60 text-primary" : "border-border text-muted-foreground line-through"
                      }`}
                    >
                      {on ? <Bell size={11} /> : <BellOff size={11} />} {m}d
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}

type Subscription = {
  id: string;
  endpoint: string;
  who: string;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
};

function deviceLabel(ua: string | null): string {
  if (!ua) return "Ukjent enhet";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android-mobil" : "Android-nettbrett";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows-PC";
  if (/Linux/i.test(ua)) return "Linux-PC";
  return "Nettleser";
}

function browserLabel(ua: string | null): string {
  if (!ua) return "";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) return "Safari";
  return "";
}

function endpointHost(endpoint: string): string {
  try { return new URL(endpoint).host; } catch { return "ukjent"; }
}

function SubscribersListPanel() {
  const [items, setItems] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, who, user_agent, created_at, last_used_at")
      .order("last_used_at", { ascending: false });
    setItems((data as Subscription[]) ?? []);
    setLoading(false);
  }

  async function remove(id: string) {
    if (!confirm("Fjerne dette abonnementet?")) return;
    await supabase.from("push_subscriptions").delete().eq("id", id);
    setItems(p => p.filter(x => x.id !== id));
  }

  // Group by who
  const byWho = items.reduce<Record<string, Subscription[]>>((acc, s) => {
    const k = s.who || "Alle";
    (acc[k] ??= []).push(s);
    return acc;
  }, {});

  return (
    <article className="panel rounded-lg p-4 md:col-span-2">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm uppercase tracking-wider text-muted-foreground">
          Abonnenter — enheter som mottar push
        </h3>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {items.length} totalt
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Laster …</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ingen enheter er abonnert ennå.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(byWho).map(([who, subs]) => (
            <div key={who}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-foreground">{who}</span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {subs.length} {subs.length === 1 ? "enhet" : "enheter"}
                </span>
              </div>
              <ul className="space-y-1.5">
                {subs.map(s => {
                  const dev = deviceLabel(s.user_agent);
                  const br = browserLabel(s.user_agent);
                  const last = new Date(s.last_used_at).toLocaleString("no-NO", {
                    day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit",
                  });
                  return (
                    <li
                      key={s.id}
                      className="flex items-start justify-between gap-2 text-sm border border-border rounded px-2.5 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <Smartphone size={13} className="text-primary shrink-0" />
                          <span className="font-medium truncate">{dev}</span>
                          {br && <span className="text-xs text-muted-foreground">· {br}</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                          {endpointHost(s.endpoint)} · sist brukt {last}
                        </div>
                      </div>
                      <button
                        onClick={() => remove(s.id)}
                        className="text-muted-foreground hover:text-destructive shrink-0 p-1"
                        title="Fjern abonnement"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
