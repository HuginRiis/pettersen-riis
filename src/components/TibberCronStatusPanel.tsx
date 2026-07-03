import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, Plus, Check, X } from "lucide-react";

type Row = {
  location: string;
  day: string;
  kwh: number;
  updated_at: string;
};

const LOCATIONS = ["tollnes", "hytta"] as const;
type Loc = (typeof LOCATIONS)[number];

type Status = {
  rows: Row[];
  lastUpdate: string | null;
  staleMinutes: number | null;
  missingYesterday: boolean;
  missingToday: boolean;
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function osloDay(offset = 0): string {
  const d = new Date(Date.now() + offset * 86400000);
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Oslo" });
}

function lastNDays(n: number): string[] {
  return Array.from({ length: n }, (_, i) => osloDay(-i));
}

async function loadStatus(): Promise<Status> {
  const { data } = await supabase
    .from("tibber_daily_kwh")
    .select("location, day, kwh, updated_at")
    .gte("day", osloDay(-7))
    .order("day", { ascending: false });
  const rows = (data as Row[]) ?? [];
  const lastUpdate = rows.length
    ? rows.reduce((acc, r) => (r.updated_at > acc ? r.updated_at : acc), rows[0].updated_at)
    : null;
  const staleMinutes = lastUpdate
    ? Math.round((Date.now() - new Date(lastUpdate).getTime()) / 60000)
    : null;
  const today = osloDay(0);
  const yesterday = osloDay(-1);
  const missingToday = LOCATIONS.some(
    (l) => !rows.some((r) => r.location === l && r.day === today),
  );
  const missingYesterday = LOCATIONS.some(
    (l) => !rows.some((r) => r.location === l && r.day === yesterday),
  );
  return { rows, lastUpdate, staleMinutes, missingYesterday, missingToday };
}

export function TibberCronStatusPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ day: string; loc: Loc } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadStatus().then(setStatus);
    const id = setInterval(() => void loadStatus().then(setStatus), 60_000);
    return () => clearInterval(id);
  }, []);

  async function trigger() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/public/hooks/snapshot-tibber-daily", { method: "POST" });
      const json = (await res.json()) as {
        ok: boolean;
        saved?: unknown[];
        error?: string;
        sources?: { pulseDays: number; tibberDays: number };
      };
      if (json.ok) {
        const s = json.sources;
        setMsg(
          `OK · ${json.saved?.length ?? 0} rader lagret${
            s ? ` (Pulse: ${s.pulseDays}, Tibber: ${s.tibberDays})` : ""
          }`,
        );
      } else {
        setMsg(`Feil: ${json.error ?? "ukjent"}`);
      }
      await loadStatus().then(setStatus);
    } catch (e: any) {
      setMsg(`Nettverksfeil: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  }

  function startEdit(day: string, loc: Loc, currentKwh?: number) {
    setEditing({ day, loc });
    setEditValue(currentKwh != null ? String(currentKwh) : "");
    setMsg(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const num = Number(editValue.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      setMsg("Ugyldig kWh-verdi");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("tibber_daily_kwh")
        .upsert(
          {
            location: editing.loc,
            day: editing.day,
            kwh: num,
            source: "manuell",
            updated_at: new Date().toISOString(),
          },
          { onConflict: "location,day" },
        );
      if (error) {
        setMsg(`Feil: ${error.message}`);
      } else {
        setMsg(`Lagret ${num} kWh for ${editing.loc} ${editing.day}`);
        setEditing(null);
        await loadStatus().then(setStatus);
      }
    } catch (e: any) {
      setMsg(`Feil: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  const stale = status?.staleMinutes != null && status.staleMinutes > 10;
  const warn = stale || status?.missingYesterday || status?.missingToday;
  const days = lastNDays(7);

  return (
    <section className="pt-4">
      <article className="panel rounded-lg p-4">
        <div className="flex items-start gap-3 flex-wrap">
          <Activity size={20} className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <h3 className="text-foreground font-semibold">Tibber daglig snapshot · cron</h3>
              {warn ? (
                <span className="text-[10px] uppercase tracking-wider text-destructive flex items-center gap-1">
                  <AlertTriangle size={10} /> trenger oppmerksomhet
                </span>
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-primary flex items-center gap-1">
                  <CheckCircle2 size={10} /> ok
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Cron kjører hvert 2. minutt og lagrer dagens kWh per hus i{" "}
              <code className="text-foreground/80">tibber_daily_kwh</code>. Mangler en dag (Pulse
              utfall) kan du legge inn verdien manuelt nedenfor.
            </p>

            <div className="grid sm:grid-cols-3 gap-2 mt-3 text-xs">
              <Stat
                label="Sist oppdatert"
                value={fmtTime(status?.lastUpdate ?? null)}
                sub={
                  status?.staleMinutes != null
                    ? `${status.staleMinutes} min siden`
                    : undefined
                }
                tone={stale ? "warn" : "ok"}
              />
              <Stat
                label="I dag"
                value={status?.missingToday ? "Mangler" : "OK"}
                tone={status?.missingToday ? "warn" : "ok"}
              />
              <Stat
                label="I går"
                value={status?.missingYesterday ? "Mangler" : "OK"}
                tone={status?.missingYesterday ? "warn" : "ok"}
              />
            </div>

            {/* 7-day grid per location */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-[11px] tabular-nums">
                <thead>
                  <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
                    <th className="text-left py-1 pr-2">Dag</th>
                    {LOCATIONS.map((l) => (
                      <th key={l} className="text-left py-1 pr-2">
                        {l}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day} className="border-t border-border/30">
                      <td className="py-1.5 pr-2 text-muted-foreground">{day}</td>
                      {LOCATIONS.map((loc) => {
                        const row = status?.rows.find(
                          (r) => r.day === day && r.location === loc,
                        );
                        const isEditing =
                          editing?.day === day && editing?.loc === loc;
                        if (isEditing) {
                          return (
                            <td key={loc} className="py-1.5 pr-2">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  inputMode="decimal"
                                  autoFocus
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void saveEdit();
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                  className="w-20 bg-background border border-border/60 rounded px-1.5 py-0.5 text-xs"
                                  placeholder="kWh"
                                />
                                <button
                                  onClick={() => void saveEdit()}
                                  disabled={saving}
                                  className="text-primary hover:bg-primary/10 rounded p-0.5"
                                  title="Lagre"
                                >
                                  <Check size={12} />
                                </button>
                                <button
                                  onClick={() => setEditing(null)}
                                  className="text-muted-foreground hover:bg-muted/30 rounded p-0.5"
                                  title="Avbryt"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={loc} className="py-1.5 pr-2">
                            {row ? (
                              <button
                                onClick={() => startEdit(day, loc, row.kwh)}
                                className="text-foreground hover:text-primary text-left"
                                title="Klikk for å redigere"
                              >
                                {Number(row.kwh).toFixed(2)} kWh
                              </button>
                            ) : (
                              <button
                                onClick={() => startEdit(day, loc)}
                                className="inline-flex items-center gap-1 text-destructive hover:text-primary text-[10px] uppercase tracking-wider"
                              >
                                <Plus size={10} /> legg til
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <button
                onClick={trigger}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-primary/60 text-primary text-xs uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
              >
                <RefreshCw size={12} className={busy ? "animate-spin" : ""} />
                {busy ? "Kjører…" : "Kjør snapshot nå"}
              </button>
              {msg && <span className="text-[11px] text-muted-foreground">{msg}</span>}
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}

function Stat({
  label,
  value,
  sub,
  tone = "ok",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "warn";
}) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        tone === "warn"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border/60 bg-background/40"
      }`}
    >
      <div className="text-[9px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div
        className={`text-sm tabular-nums mt-0.5 ${
          tone === "warn" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
