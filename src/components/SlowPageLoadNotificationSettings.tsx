import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Bell, BellOff, Save, Send, Plus, Trash2, Gauge } from "lucide-react";
import {
  getSlowPageConfig,
  saveSlowPageConfigFn,
  sendSlowPageLoadTestFn,
} from "@/server/slow-page-push.functions";
import { getPageLoadStats } from "@/lib/page-load.functions";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

type RouteRule = { route: string; ms: number };
type Cfg = {
  enabled: boolean;
  recipient: string;
  default_ms: number;
  cooldown_min: number;
  window_min: number;
  min_samples: number;
  only_mobile: boolean;
  routes: RouteRule[];
  slow_avg_enabled: boolean;
  slow_avg_ms: number;
  slow_avg_recipient: string;
};

const DEFAULTS: Cfg = {
  enabled: false,
  recipient: "Alle",
  default_ms: 4000,
  cooldown_min: 120,
  window_min: 60,
  min_samples: 3,
  only_mobile: true,
  routes: [],
  slow_avg_enabled: false,
  slow_avg_ms: 3000,
  slow_avg_recipient: "",
};

export function SlowPageLoadNotificationSettings() {
  const load = useServerFn(getSlowPageConfig);
  const save = useServerFn(saveSlowPageConfigFn);
  const test = useServerFn(sendSlowPageLoadTestFn);
  const stats = useServerFn(getPageLoadStats);

  const [cfg, setCfg] = useState<Cfg>(DEFAULTS);
  const [routes, setRoutes] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [newRoute, setNewRoute] = useState("");
  const [newMs, setNewMs] = useState(5000);

  useEffect(() => {
    void (async () => {
      const c = await load();
      setCfg({ ...DEFAULTS, ...c, routes: c.routes ?? [] });
      const s = await stats({ data: { days: 14 } });
      const list = s.routes.map((r) => r.route).sort();
      setRoutes(Array.from(new Set(list)));
    })().catch(() => {});
  }, [load, stats]);

  function setRule(route: string, ms: number) {
    setCfg((p) => {
      const others = p.routes.filter((r) => r.route !== route);
      return { ...p, routes: [...others, { route, ms }].sort((a, b) => a.route.localeCompare(b.route)) };
    });
  }
  function removeRule(route: string) {
    setCfg((p) => ({ ...p, routes: p.routes.filter((r) => r.route !== route) }));
  }
  function addNewRule() {
    const r = newRoute.trim();
    if (!r) return;
    setRule(r.startsWith("/") ? r : `/${r}`, Math.max(500, newMs | 0));
    setNewRoute("");
    setNewMs(5000);
  }

  async function onSave() {
    setSaving(true);
    setMsg(null);
    try {
      await save({ data: cfg });
      setMsg("Lagret");
    } catch (e) {
      setMsg(`Feil: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    setMsg(null);
    try {
      const r = await test({});
      setMsg(`Test sendt: ${r.sent} ok, ${r.errors} feil`);
    } catch (e) {
      setMsg(`Feil: ${String(e)}`);
    }
  }

  return (
    <section className="container mx-auto px-4 pt-4 space-y-4">
      {/* Hoved-varsel: treg sidelasting */}
      <article className="panel rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Gauge size={20} className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h3 className="text-foreground font-semibold">Treg sidelasting</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Push når en side bruker for lang tid å laste. Egne terskler per side, ellers brukes standardterskelen.
                Data hentes fra <em>Sidelaster</em>-loggen i Vakttårnet.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Mottaker (treg sidelasting)</label>
                <select
                  value={cfg.recipient}
                  onChange={(e) => setCfg((p) => ({ ...p, recipient: e.target.value }))}
                  className="mt-1 w-full bg-background border border-border/60 rounded px-2 py-1.5 text-sm"
                >
                  {WHO_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={() => setCfg((p) => ({ ...p, enabled: !p.enabled }))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs uppercase tracking-wider transition ${
                    cfg.enabled ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {cfg.enabled ? <Bell size={12} /> : <BellOff size={12} />}
                  {cfg.enabled ? "Aktivert" : "Av"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumField label="Standard terskel (ms)" value={cfg.default_ms} min={500} step={100}
                onChange={(v) => setCfg((p) => ({ ...p, default_ms: v }))} />
              <NumField label="Vindu (min)" value={cfg.window_min} min={5} max={720}
                onChange={(v) => setCfg((p) => ({ ...p, window_min: v }))} />
              <NumField label="Cooldown (min)" value={cfg.cooldown_min} min={5} max={1440}
                onChange={(v) => setCfg((p) => ({ ...p, cooldown_min: v }))} />
              <NumField label="Min. målinger" value={cfg.min_samples} min={1} max={100}
                onChange={(v) => setCfg((p) => ({ ...p, min_samples: v }))} />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.only_mobile}
                onChange={(e) => setCfg((p) => ({ ...p, only_mobile: e.target.checked }))}
              />
              Tell kun mobil-målinger (iPhone/Android) — anbefalt
            </label>

            {/* Per-side regler */}
            <div className="space-y-2">
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground">Per-side terskler</h4>
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {cfg.routes.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">Ingen overstyringer — alle sider bruker standardterskelen.</p>
                )}
                {cfg.routes.map((r) => (
                  <div key={r.route} className="flex items-center gap-2">
                    <code className="text-xs text-foreground flex-1 truncate">{r.route}</code>
                    <input
                      type="number"
                      min={500}
                      step={100}
                      value={r.ms}
                      onChange={(e) => setRule(r.route, Math.max(500, Number(e.target.value) || 0))}
                      className="w-24 bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
                    />
                    <span className="text-[10px] text-muted-foreground">ms</span>
                    <button
                      onClick={() => removeRule(r.route)}
                      className="text-muted-foreground hover:text-destructive p-1"
                      aria-label="Fjern"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                <select
                  value={newRoute}
                  onChange={(e) => setNewRoute(e.target.value)}
                  className="flex-1 bg-background border border-border/60 rounded px-2 py-1 text-sm"
                >
                  <option value="">Velg side …</option>
                  {routes.filter((r) => !cfg.routes.some((x) => x.route === r)).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min={500}
                  step={100}
                  value={newMs}
                  onChange={(e) => setNewMs(Number(e.target.value) || 0)}
                  className="w-24 bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
                />
                <button
                  onClick={addNewRule}
                  disabled={!newRoute}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-primary/60 text-primary text-xs hover:bg-primary/10 disabled:opacity-50"
                >
                  <Plus size={12} /> Legg til
                </button>
              </div>
            </div>

            {/* Ekstra ytelses-varsel: globalt snitt */}
            <div className="pt-3 mt-3 border-t border-border/40 space-y-2">
              <div className="flex items-center gap-2">
                <Activity size={16} className="text-primary" />
                <h4 className="text-sm font-medium text-foreground">Lav generell ytelse</h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Varsler hvis snitt-lastetid på tvers av alle sider overstiger terskelen i vinduet over. Bruker samme mottaker, vindu og cooldown.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Mottaker (lav generell ytelse)
                  </label>
                  <select
                    value={cfg.slow_avg_recipient || ""}
                    onChange={(e) => setCfg((p) => ({ ...p, slow_avg_recipient: e.target.value }))}
                    className="mt-1 w-full bg-background border border-border/60 rounded px-2 py-1.5 text-sm"
                  >
                    <option value="">Samme som over ({cfg.recipient})</option>
                    {WHO_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setCfg((p) => ({ ...p, slow_avg_enabled: !p.slow_avg_enabled }))}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs uppercase tracking-wider transition ${
                      cfg.slow_avg_enabled ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    {cfg.slow_avg_enabled ? <Bell size={12} /> : <BellOff size={12} />}
                    {cfg.slow_avg_enabled ? "På" : "Av"}
                  </button>
                </div>
              </div>
              <div className="flex items-end gap-2 flex-wrap">
                <NumField label="Snitt-terskel (ms)" value={cfg.slow_avg_ms} min={500} step={100}
                  onChange={(v) => setCfg((p) => ({ ...p, slow_avg_ms: v }))} />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => void onSave()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-primary/60 text-primary text-xs uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
              >
                <Save size={12} /> {saving ? "Lagrer…" : "Lagre"}
              </button>
              <button
                onClick={() => void onTest()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border/60 text-xs uppercase tracking-wider hover:border-primary/60 hover:text-primary"
              >
                <Send size={12} /> Send test
              </button>
              {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

function NumField({
  label, value, onChange, min, max, step,
}: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1 w-full bg-background border border-border/60 rounded px-2 py-1.5 text-sm tabular-nums"
      />
    </label>
  );
}
