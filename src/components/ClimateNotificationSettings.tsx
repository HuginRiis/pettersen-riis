import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Thermometer, Snowflake, Flame, Users, Send, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendClimateTestPush } from "@/server/climate-push.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const WHO_OPTIONS = [
  "Alle",
  "Arne & Rebekka",
  "Arne",
  "Rebekka",
  "Marita",
  "Nora",
  "Celine",
  "Mira",
] as const;

type Pref = {
  id: string;
  room_key: string;
  label: string;
  recipient: string;
  enabled: boolean;
  notify_hot: boolean;
  notify_cold: boolean;
  hot_threshold: number;
  cold_threshold: number;
  last_value: number | null;
  last_checked_at: string | null;
  last_notified_hot_at: string | null;
  last_notified_cold_at: string | null;
};

function TempPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${disabled ? "opacity-50" : ""}`}
      style={{
        background: "color-mix(in oklab, var(--foreground) 6%, transparent)",
        border: "1px solid color-mix(in oklab, var(--gold) 25%, transparent)",
      }}
    >
      <button
        type="button"
        aria-label="Senk"
        disabled={disabled || value <= 5}
        onClick={() => onChange(Math.max(5, value - 1))}
        className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--gold)] disabled:opacity-30"
      >
        −
      </button>
      <span className="text-display tabular-nums text-[var(--gold)] min-w-[2.5rem] text-center text-sm">
        {value}°
      </span>
      <button
        type="button"
        aria-label="Hev"
        disabled={disabled || value >= 35}
        onClick={() => onChange(Math.min(35, value + 1))}
        className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--gold)] disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function PrefCard({ pref, onChange }: { pref: Pref; onChange: () => void }) {
  const sendTest = useServerFn(sendClimateTestPush);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const update = async (patch: Partial<Pref>) => {
    setBusy("save");
    const { error } = await supabase
      .from("climate_notification_prefs")
      .update(patch as any)
      .eq("id", pref.id);
    setBusy(null);
    if (error) {
      setMsg(`Feil: ${error.message}`);
      return;
    }
    onChange();
  };

  const test = async () => {
    setBusy("test");
    setMsg(null);
    try {
      const r = await sendTest({ data: { prefId: pref.id } });
      setMsg(`Sendt: ${r.sent} av ${r.total}${r.temp != null ? ` · ${r.temp.toFixed(1)}° nå` : ""}`);
    } catch (e: any) {
      setMsg(`Feil: ${e?.message ?? "ukjent"}`);
    } finally {
      setBusy(null);
    }
  };

  const lastStr = pref.last_checked_at
    ? new Date(pref.last_checked_at).toLocaleString("nb-NO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : null;

  return (
    <article className="panel rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Thermometer size={16} className="text-[var(--gold)]" />
          <span className="text-display tracking-[0.3em] uppercase text-sm text-primary">
            {pref.label}
          </span>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={pref.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="accent-[var(--gold)]"
          />
          <span className="text-[10px] tracking-[0.25em] uppercase text-muted-foreground">Aktiv</span>
        </label>
      </header>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={pref.notify_hot}
              disabled={!pref.enabled}
              onChange={(e) => update({ notify_hot: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <Flame size={14} className="text-orange-400" />
            <span>For varmt over</span>
          </label>
          <TempPicker
            value={pref.hot_threshold}
            onChange={(v) => update({ hot_threshold: v })}
            disabled={!pref.enabled || !pref.notify_hot}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={pref.notify_cold}
              disabled={!pref.enabled}
              onChange={(e) => update({ notify_cold: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <Snowflake size={14} className="text-cyan-300" />
            <span>For kaldt under</span>
          </label>
          <TempPicker
            value={pref.cold_threshold}
            onChange={(v) => update({ cold_threshold: v })}
            disabled={!pref.enabled || !pref.notify_cold}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm">
            <Users size={14} className="text-[var(--gold)]" />
            <span>Mottaker</span>
          </div>
          <Select
            value={pref.recipient}
            disabled={!pref.enabled}
            onValueChange={(v) => update({ recipient: v })}
          >
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHO_OPTIONS.map((w) => (
                <SelectItem key={w} value={w}>{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <div className="text-[10px] text-muted-foreground">
          {pref.last_value != null ? (
            <>Nå: <span className="tabular-nums text-foreground">{pref.last_value.toFixed(1)}°</span></>
          ) : "Ingen måling ennå"}
          {lastStr && <span className="ml-2 opacity-70">· sjekket {lastStr}</span>}
        </div>
        <button
          type="button"
          onClick={test}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-border/60 hover:border-primary/60 hover:text-primary transition disabled:opacity-50"
        >
          {busy === "test" ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Send test
        </button>
      </div>

      {msg && <p className="text-[10px] text-muted-foreground">{msg}</p>}

      <p className="text-[10px] text-muted-foreground italic leading-relaxed">
        Ravnen flyr én gang per dag per retning når temperaturen forlater {pref.cold_threshold}°–{pref.hot_threshold}°.
        Sjekkes automatisk hvert 20. min via Netatmo-cron.
      </p>
    </article>
  );
}

export function ClimateNotificationSettings() {
  const [prefs, setPrefs] = useState<Pref[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("climate_notification_prefs")
      .select("*")
      .order("label");
    if (error) {
      setErr(error.message);
      return;
    }
    setPrefs((data ?? []) as any);
  };

  useEffect(() => {
    void load();
  }, []);

  if (err) return <p className="text-rose-400 text-xs">{err}</p>;
  if (!prefs) return <p className="text-muted-foreground text-xs">Laster…</p>;
  if (prefs.length === 0) return <p className="text-muted-foreground text-xs">Ingen klima-varslinger satt opp.</p>;

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {prefs.map((p) => (
        <PrefCard key={p.id} pref={p} onChange={load} />
      ))}
    </div>
  );
}
