import { useEffect, useState } from "react";
import {
  HEADER_BADGE_DEFS,
  type HeaderBadgeSettings,
  saveHeaderBadgeSettings,
  useHeaderBadgeSettings,
} from "@/hooks/use-header-badge-settings";
import { LayoutGrid, Save, Clock } from "lucide-react";
import { getBadgeMeta, listBadgeKeys, subscribeBadgeMeta } from "@/lib/badge-cache";

const KNOWN_USERS = ["Arne", "Rebekka", "Ada", "Noah", "Petter", "Mor", "Far"];

const BADGE_KEY_LABELS: Record<string, string> = {
  "push-today-count": "Push i dag",
  "lights-on-text": "Lys tent",
  "alarm-state": "Alarm-status",
  "alerts-severity": "Farevarsler",
  "power-vs-yesterday-pct": "Strøm i dag vs i går",
  "mower-status": "Gressklipper-status",
  "garbage-next-pickups": "Neste søppeltømming",
  "utgangsdoren-lock": "Utgangsdøren låst/åpen",
};

function labelForKey(key: string): string {
  if (BADGE_KEY_LABELS[key]) return BADGE_KEY_LABELS[key];
  if (key.startsWith("steps-today:")) return `Skritt — ${key.slice("steps-today:".length)}`;
  if (key.startsWith("current-temp:")) return `Temperatur (${key.slice("current-temp:".length)})`;
  if (key.startsWith("roborock-status:")) return `Støvsuger — ${key.slice("roborock-status:".length)}`;
  return key;
}

function fmtClock(ms: number): string {
  return new Date(ms).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Oslo" });
}
function fmtRel(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 10) return "nå";
  if (s < 60) return `${s}s siden`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min siden`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} t siden`;
  return `${Math.round(h / 24)} d siden`;
}

function BadgeUpdateTimesPanel() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = subscribeBadgeMeta(() => force((n) => n + 1));
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => { unsub(); clearInterval(t); };
  }, []);
  const keys = listBadgeKeys();
  return (
    <div className="mt-4 panel rounded p-3 border border-border/50">
      <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">
        <Clock size={12} /> Sist oppdatert pr badge
      </p>
      {keys.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ingen badges har lastet data ennå i denne økten.</p>
      ) : (
        <div className="grid gap-1.5">
          {keys.map((k) => {
            const m = getBadgeMeta(k);
            if (!m) return null;
            return (
              <div key={k} className="flex items-center justify-between gap-3 text-xs border-b border-border/30 last:border-0 pb-1.5 last:pb-0">
                <span className="font-medium text-foreground truncate">{labelForKey(k)}</span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">
                  <span className="text-foreground">{fmtClock(m.at)}</span>
                  <span className="text-muted-foreground/70"> · {fmtRel(m.at)}</span>
                  {m.prevAt != null && (
                    <span className="text-muted-foreground/60"> (forrige {fmtClock(m.prevAt)})</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-muted-foreground mt-2">
        Viser når hvert badge sist hentet data, samt forrige henting. Listen oppdateres når badges
        oppdaterer cachen.
      </p>
    </div>
  );
}

export function HeaderBadgeSettingsPanel() {
  const remote = useHeaderBadgeSettings();
  const [draft, setDraft] = useState<HeaderBadgeSettings>(remote);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { setDraft(remote); }, [remote]);

  const setBadge = (id: string, patch: Partial<{ enabled: boolean; users: string[] }>) => {
    setDraft((d) => ({
      ...d,
      badges: { ...d.badges, [id]: { ...d.badges[id], ...patch } },
    }));
  };
  const toggleUser = (id: string, user: string) => {
    const cur = draft.badges[id]?.users ?? [];
    setBadge(id, { users: cur.includes(user) ? cur.filter((u) => u !== user) : [...cur, user] });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      await saveHeaderBadgeSettings(draft);
      setMsg("Lagret ✓");
      setTimeout(() => setMsg(null), 2500);
    } finally { setSaving(false); }
  };

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4">
        <h3 className="text-foreground font-semibold flex items-center gap-2">
          <LayoutGrid size={18} className="text-primary" /> Topp-meny badges
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Skru av/på de små merkene i topp-menyen, og velg hvilke brukere som skal se hver enkelt.
          Tom liste = vises for alle.
        </p>

        <BadgeUpdateTimesPanel />

        <div className="mt-4 panel rounded p-3 border border-border/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Menyrad-tekst</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={draft.fitOneLine}
              onChange={(e) => {
                const next = { ...draft, fitOneLine: e.target.checked };
                setDraft(next);
                void saveHeaderBadgeSettings(next);
              }}
              className="accent-primary"
            />
            <span>Krymp skriften så menynavn + badges får plass på én linje</span>
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            Av = normal skriftstørrelse, kan bryte til ny linje. På = mindre skrift og ingen linjebryting.
          </p>
        </div>

        <div className="mt-4 panel rounded p-3 border border-border/50">

          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Værmerke — periode</p>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <label className="flex items-center gap-2">
              <span>Start:</span>
              <select
                value={draft.weather.startOffset}
                onChange={(e) => setDraft((d) => ({ ...d, weather: { ...d.weather, startOffset: Number(e.target.value) === 0 ? 0 : 1 } }))}
                className="bg-background border border-border rounded px-2 py-1"
              >
                <option value={0}>I dag</option>
                <option value={1}>I morgen</option>
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span>Antall dager:</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft.weather.days === 0 ? "" : String(draft.weather.days)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  if (raw === "") {
                    setDraft((d) => ({ ...d, weather: { ...d.weather, days: 0 } }));
                    return;
                  }
                  const n = Math.min(14, Math.max(1, parseInt(raw, 10)));
                  setDraft((d) => ({ ...d, weather: { ...d.weather, days: n } }));
                }}
                onBlur={() => {
                  if (!draft.weather.days || draft.weather.days < 1) {
                    setDraft((d) => ({ ...d, weather: { ...d.weather, days: 1 } }));
                  }
                }}
                className="w-16 bg-background border border-border rounded px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.weather.showTemp}
                onChange={(e) => setDraft((d) => ({ ...d, weather: { ...d.weather, showTemp: e.target.checked } }))}
                className="accent-primary"
              />
              <span>Vis temperatur</span>
            </label>
            <span className="text-xs text-muted-foreground">
              Eks: «I dag» + 3 dager → vises i dag, i morgen og i overmorgen.
            </span>
          </div>
        </div>

        <div className="mt-4 panel rounded p-3 border border-border/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Søppeltømming-badge <span className="ml-1 text-[10px] normal-case text-muted-foreground/70">(lagres automatisk)</span></p>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <label className="flex items-center gap-2">
              <span>Vis fra:</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={draft.garbage.maxDaysAhead === 0 ? "" : String(draft.garbage.maxDaysAhead)}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  const n = raw === "" ? 0 : Math.min(30, Math.max(0, parseInt(raw, 10)));
                  const next = { ...draft, garbage: { ...draft.garbage, maxDaysAhead: n } };
                  setDraft(next);
                  void saveHeaderBadgeSettings(next);
                }}
                className="w-16 bg-background border border-border rounded px-2 py-1"
              />
              <span>dager før</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.garbage.showAllSameDay}
                onChange={(e) => {
                  const next = { ...draft, garbage: { ...draft.garbage, showAllSameDay: e.target.checked } };
                  setDraft(next);
                  void saveHeaderBadgeSettings(next);
                }}
                className="accent-primary"
              />
              <span>Vis alle fraksjoner samme dag</span>
            </label>
            <span className="text-xs text-muted-foreground">
              Av = kun første kommende tømming. På = alle som tømmes samme dag vises.
            </span>
          </div>
        </div>

        <div className="mt-4 panel rounded p-3 border border-border/50">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Trening siste 4 uker — sportstyper</p>
          <div className="flex flex-wrap gap-3 items-center text-sm">
            {([
              { id: "run", label: "🏃 Løping" },
              { id: "ride", label: "🚴 Sykkel" },
              { id: "swim", label: "🏊 Svømming" },
              { id: "walk", label: "🚶 Gåing" },
              { id: "hike", label: "🥾 Fjelltur" },
            ] as const).map((s) => (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.training[s.id]}
                  onChange={(e) => setDraft((d) => ({ ...d, training: { ...d.training, [s.id]: e.target.checked } }))}
                  className="accent-primary"
                />
                <span>{s.label}</span>
              </label>
            ))}
            <span className="text-xs text-muted-foreground">Gjelder badge for både Arne og Rebekka.</span>
          </div>
        </div>




        <div className="mt-4 grid gap-2">
          {HEADER_BADGE_DEFS.map((b) => {
            const cfg = draft.badges[b.id] ?? { enabled: true, users: [] };
            return (
              <div key={b.id} className="panel rounded p-3 border border-border/50">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.enabled}
                      onChange={(e) => setBadge(b.id, { enabled: e.target.checked })}
                      className="accent-primary"
                    />
                    <span className="font-medium">{b.label}</span>
                  </label>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {cfg.users.length === 0 ? "alle brukere" : `${cfg.users.length} valgt`}
                  </span>
                </div>
                {cfg.enabled && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {KNOWN_USERS.map((u) => {
                      const on = cfg.users.includes(u);
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={() => toggleUser(b.id, u)}
                          className={`px-2 py-0.5 rounded-full text-[11px] border transition ${
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:bg-accent/40"
                          }`}
                        >
                          {u}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50"
          >
            <Save size={14} /> {saving ? "Lagrer…" : "Lagre"}
          </button>
          {msg && <span className="text-xs text-emerald-400">{msg}</span>}
        </div>
      </article>
    </section>
  );
}
