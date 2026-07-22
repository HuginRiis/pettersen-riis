import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell, PageHero } from "@/components/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Battery,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Bell,
  RefreshCcw,
  Send,
  ShieldCheck,
} from "lucide-react";
import heroImg from "@/assets/got-batterier.jpg";
import {
  getBatteryOverview,
  getBatterySettingsFn,
  updateBatterySettingsFn,
  sendBatteryTestPushFn,
  type BatteryItem,
  type BatteryOverview,
  type BatterySettings,
} from "@/lib/batteries.functions";

const RECIPIENTS = ["Alle", "Arne", "Rebekka", "Arne & Rebekka"] as const;

export const Route = createFileRoute("/batterier")({
  head: () => ({
    meta: [
      { title: "Batterier i huset | House Pettersen-Riis" },
      {
        name: "description",
        content:
          "Alle batteri-indikatorer fra Homey (inkl. Netatmo via Homey) og Gardena samlet på ett sted. Med varsling når nivået er lavt.",
      },
      { property: "og:title", content: "Batterier i huset" },
      {
        property: "og:description",
        content: "Full oversikt over batteri-nivå på sensorer, låser og enheter i huset.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BatterierRoute,
});

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(diff / 60_000));
  if (m < 1) return "akkurat nå";
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.floor(h / 24)} d siden`;
}

function levelColor(pct: number, threshold: number) {
  if (pct <= threshold) return { text: "text-red-400", ring: "ring-red-500/50", bar: "bg-red-500", glow: "shadow-[0_0_24px_rgba(239,68,68,0.35)]" };
  if (pct <= threshold + 15) return { text: "text-amber-300", ring: "ring-amber-500/40", bar: "bg-amber-400", glow: "shadow-[0_0_18px_rgba(251,191,36,0.25)]" };
  if (pct <= 60) return { text: "text-emerald-300", ring: "ring-emerald-500/30", bar: "bg-emerald-400", glow: "" };
  return { text: "text-emerald-200", ring: "ring-emerald-500/30", bar: "bg-emerald-400", glow: "" };
}

function LevelIcon({ pct, className }: { pct: number; className?: string }) {
  if (pct <= 15) return <BatteryWarning className={className} />;
  if (pct <= 40) return <BatteryLow className={className} />;
  if (pct <= 75) return <BatteryMedium className={className} />;
  if (pct < 100) return <BatteryFull className={className} />;
  return <BatteryFull className={className} />;
}

function BatteryCard({ item, threshold }: { item: BatteryItem; threshold: number }) {
  const c = levelColor(item.batteryPct, threshold);
  const isLow = item.batteryPct <= threshold;
  return (
    <article
      className={`panel rounded-xl p-4 ring-1 ${c.ring} ${c.glow} transition-all hover:-translate-y-0.5`}
      style={{ contain: "layout paint style" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground truncate">
            {item.zone ?? "Ukjent"} · {item.source}
          </div>
          <h3 className="mt-1 text-base font-medium text-foreground truncate">{item.name}</h3>
          {item.kind && (
            <div className="text-xs text-muted-foreground/80 mt-0.5 capitalize">{item.kind}</div>
          )}
        </div>
        <div className={`relative shrink-0 ${c.text}`}>
          <LevelIcon pct={item.batteryPct} className={`w-9 h-9 ${isLow ? "animate-pulse" : ""}`} />
          {isLow && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
          )}
        </div>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <div className={`text-3xl font-semibold tabular-nums ${c.text}`}>{item.batteryPct}%</div>
        {item.batteryState && (
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {item.batteryState}
          </div>
        )}
      </div>

      <div className="mt-2 h-1.5 rounded-full bg-background/60 overflow-hidden">
        <div
          className={`h-full ${c.bar} transition-all duration-1000`}
          style={{
            width: `${Math.max(4, item.batteryPct)}%`,
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 40%, rgba(255,255,255,0.2) 80%)",
            backgroundSize: "200% 100%",
            animation: isLow ? "wx-shimmer 1.6s linear infinite" : undefined,
          }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Sist sett: {fmtRelative(item.lastSeen)}</span>
        {!item.reachable && <span className="text-amber-400/90">off-line</span>}
      </div>
    </article>
  );
}

function SettingsCard({
  settings,
  onChange,
  onTest,
  busy,
}: {
  settings: BatterySettings;
  onChange: (patch: Partial<BatterySettings>) => void;
  onTest: () => void;
  busy: boolean;
}) {
  return (
    <div className="panel rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-primary" />
          <h2 className="text-lg text-foreground">Push-varslinger</h2>
        </div>
        <Switch
          checked={settings.enabled}
          onCheckedChange={(v) => onChange({ enabled: v })}
          aria-label="Slå på batteri-varsler"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Sender push når en enhet faller til eller under terskelen. Maks én varsling per enhet per dag.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground">Terskel (%)</span>
          <Input
            type="number"
            min={5}
            max={95}
            step={5}
            value={settings.threshold}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 1 && n <= 100) onChange({ threshold: n });
            }}
            disabled={!settings.enabled}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">Mottaker</span>
          <select
            value={settings.recipient}
            onChange={(e) => onChange({ recipient: e.target.value })}
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            disabled={!settings.enabled}
          >
            {RECIPIENTS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={onTest} disabled={busy} className="gap-1.5">
          <Send size={14} /> Send test-push
        </Button>
        <div className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <ShieldCheck size={12} className="text-emerald-400" /> Cron kjører hvert minutt
        </div>
      </div>
    </div>
  );
}

function BatterierRoute() {
  const fetchOverview = useServerFn(getBatteryOverview);
  const fetchSettings = useServerFn(getBatterySettingsFn);
  const saveSettings = useServerFn(updateBatterySettingsFn);
  const testPush = useServerFn(sendBatteryTestPushFn);

  const [overview, setOverview] = useState<BatteryOverview | null>(null);
  const [settings, setSettings] = useState<BatterySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingBusy, setSavingBusy] = useState(false);

  const load = async (force?: boolean) => {
    if (force) setRefreshing(true);
    try {
      const [o, s] = await Promise.all([fetchOverview({ data: { force: !!force } }), fetchSettings()]);
      setOverview(o);
      setSettings(s);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(() => load(), 2 * 60 * 60_000);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateSetting = async (patch: Partial<BatterySettings>) => {
    if (!settings) return;
    const optimistic = { ...settings, ...patch };
    setSettings(optimistic);
    setSavingBusy(true);
    try {
      const next = await saveSettings({ data: patch as any });
      setSettings(next);
    } catch (e) {
      toast.error("Kunne ikke lagre innstillinger");
      setSettings(settings);
    } finally {
      setSavingBusy(false);
    }
  };

  const items = overview?.items ?? [];
  const threshold = settings?.threshold ?? 20;
  const low = items.filter((i) => i.batteryPct <= threshold);
  const bySource = new Map<string, BatteryItem[]>();
  for (const it of items) {
    const arr = bySource.get(it.source) ?? [];
    arr.push(it);
    bySource.set(it.source, arr);
  }
  const avgAll = items.length ? Math.round(items.reduce((a, b) => a + b.batteryPct, 0) / items.length) : 0;

  return (
    <PageShell>
      <PageHero
        eyebrow="Kraften i huset"
        title="Batterier i huset"
        subtitle="Alle batteri-nivåer fra Homey (inkl. Netatmo via Homey) og Gardena. Oppdateres hver andre time."
        image={heroImg}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background/60 backdrop-blur-sm border border-primary/30 text-sm">
            <Battery size={14} className="text-primary" />
            <span className="text-muted-foreground">Enheter</span>
            <span className="font-semibold text-foreground">{items.length}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background/60 backdrop-blur-sm border border-emerald-500/30 text-sm">
            <BatteryFull size={14} className="text-emerald-400" />
            <span className="text-muted-foreground">Snitt</span>
            <span className="font-semibold text-foreground">{avgAll}%</span>
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-background/60 backdrop-blur-sm border text-sm ${
              low.length > 0 ? "border-red-500/40" : "border-border"
            }`}
          >
            <BatteryLow size={14} className={low.length > 0 ? "text-red-400" : "text-muted-foreground"} />
            <span className="text-muted-foreground">Lavt</span>
            <span className={`font-semibold ${low.length > 0 ? "text-red-300" : "text-foreground"}`}>{low.length}</span>
          </span>
        </div>
      </PageHero>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {overview
              ? `Hentet ${fmtRelative(overview.fetchedAt)}${overview.cached ? " (fra cache)" : ""}`
              : "Henter…"}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => load(true)}
            disabled={refreshing}
            className="gap-1.5"
          >
            <RefreshCcw size={14} className={refreshing ? "animate-spin" : ""} /> Oppdater nå
          </Button>
        </div>

        {settings && (
          <SettingsCard
            settings={settings}
            onChange={updateSetting}
            onTest={async () => {
              try {
                const r = await testPush();
                toast.success(`Test-push sendt (${r.sent} ok / ${r.errors} feil)`);
              } catch {
                toast.error("Kunne ikke sende test");
              }
            }}
            busy={savingBusy}
          />
        )}

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Henter batteri-nivåer…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            Ingen batteri-data funnet ennå. Sjekk at Homey/Netatmo/Gardena er tilkoblet.
          </div>
        ) : (
          <>
            {low.length > 0 && (
              <section>
                <h2 className="heading-section text-lg mb-3 flex items-center gap-2">
                  <BatteryWarning className="text-red-400" size={18} /> Erstatninger nær
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {low.map((it) => (
                    <BatteryCard key={it.id} item={it} threshold={threshold} />
                  ))}
                </div>
              </section>
            )}
            {Array.from(bySource.entries()).map(([src, arr]) => (
              <section key={src}>
                <h2 className="heading-section text-lg mb-3 capitalize">
                  {src === "homey" ? "Homey" : "Gardena"}
                  <span className="ml-2 text-xs text-muted-foreground">({arr.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {arr.map((it) => (
                    <BatteryCard key={it.id} item={it} threshold={threshold} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

        {overview?.errors && overview.errors.length > 0 && (
          <div className="text-xs text-amber-400/80">Feil: {overview.errors.join(" · ")}</div>
        )}
      </div>
    </PageShell>
  );
}
