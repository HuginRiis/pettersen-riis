import { useEffect, useState } from "react";
import {
  HEADER_BADGE_DEFS,
  type HeaderBadgeSettings,
  saveHeaderBadgeSettings,
  useHeaderBadgeSettings,
} from "@/hooks/use-header-badge-settings";
import { LayoutGrid, Save } from "lucide-react";

const KNOWN_USERS = ["Arne", "Rebekka", "Ada", "Noah", "Petter", "Mor", "Far"];

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
