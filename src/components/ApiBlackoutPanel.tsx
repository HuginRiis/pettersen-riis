import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getApiBlackoutConfig,
  setApiBlackoutConfig,
  type BlackoutConfig,
} from "@/server/api-blackout.functions";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

function isActiveNow(cfg: BlackoutConfig): boolean {
  if (!cfg.enabled) return false;
  const start = toMinutes(cfg.start_time);
  const end = toMinutes(cfg.end_time);
  if (start === end) return false;
  const now = new Date();
  // Bruk Europe/Oslo
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Oslo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const cur = h * 60 + m;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}

export function ApiBlackoutPanel() {
  const fetchCfg = useServerFn(getApiBlackoutConfig);
  const saveCfg = useServerFn(setApiBlackoutConfig);
  const [cfg, setCfg] = useState<BlackoutConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("00:00");
  const [end, setEnd] = useState("06:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const c = await fetchCfg();
      setCfg(c);
      setEnabled(c.enabled);
      setStart(c.start_time);
      setEnd(c.end_time);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [fetchCfg]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await saveCfg({ data: { enabled, start_time: start, end_time: end } });
      setCfg(c);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const active = cfg ? isActiveNow(cfg) : false;
  const dirty =
    cfg &&
    (enabled !== cfg.enabled || start !== cfg.start_time || end !== cfg.end_time);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span
          className={`inline-block w-2 h-2 rounded-full shrink-0 ${
            active ? "bg-destructive animate-pulse" : enabled ? "bg-yellow-500" : "bg-primary"
          }`}
        />
        <span className="text-[10px] tracking-[0.3em] uppercase text-muted-foreground">
          Master-blackout
        </span>
        <span
          className={`text-xs tracking-[0.25em] uppercase ${
            active ? "text-destructive" : enabled ? "text-yellow-500" : "text-primary"
          }`}
        >
          {active ? "Aktiv NÅ — alle API blokkert" : enabled ? "Planlagt" : "Av"}
        </span>
        {cfg?.updated_at && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            endret {new Date(cfg.updated_at).toLocaleString("nb-NO")}
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        Innenfor tidsvinduet blokkeres ALLE serverkall til alle eksterne API —
        både cron-jobber, cache-refresh og on-demand kall fra sider. Tiden
        tolkes som Europe/Oslo. Hvis slutt-tid er før start-tid, går vinduet
        over midnatt (f.eks. 22:00–06:00).
      </p>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          ⚠ {error}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span>Aktiver tidsvindu</span>
        </label>

        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Fra</span>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-xs font-mono"
          />
        </label>

        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Til</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-xs font-mono"
          />
        </label>

        <button
          type="button"
          onClick={save}
          disabled={busy || !dirty}
          className="ml-auto px-4 py-1.5 rounded border border-primary/50 text-primary text-[10px] tracking-[0.2em] uppercase hover:bg-primary/10 disabled:opacity-40"
        >
          {busy ? "Lagrer…" : dirty ? "Lagre" : "Lagret"}
        </button>
      </div>

      {savedAt && !dirty && (
        <p className="text-[10px] text-primary italic">
          ✦ Lagret {new Date(savedAt).toLocaleTimeString("nb-NO")} — trer i kraft innen ~15 sek.
        </p>
      )}
    </div>
  );
}
