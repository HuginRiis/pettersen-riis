import { useEffect, useState } from "react";
import { Thermometer, Snowflake, Flame, Users, RefreshCw, Send } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listClimatePrefs,
  updateClimatePref,
  runClimateNotifications,
  type ClimatePref,
} from "@/server/climate-push.functions";
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

function TempPicker({
  value,
  onChange,
  disabled,
  min = 0,
  max = 35,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
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
        disabled={disabled || value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
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
        disabled={disabled || value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-6 h-6 rounded-full flex items-center justify-center text-[var(--gold)] disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

function RoomCard({ pref, onSave }: { pref: ClimatePref; onSave: (p: ClimatePref) => void }) {
  const [local, setLocal] = useState(pref);
  useEffect(() => setLocal(pref), [pref]);

  const dirty =
    local.enabled !== pref.enabled ||
    local.notify_hot !== pref.notify_hot ||
    local.hot_threshold !== pref.hot_threshold ||
    local.notify_cold !== pref.notify_cold ||
    local.cold_threshold !== pref.cold_threshold ||
    local.recipient !== pref.recipient ||
    local.cooldown_minutes !== pref.cooldown_minutes;

  return (
    <article className="panel rounded-lg p-4 space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Thermometer size={16} className="text-[var(--gold)]" />
          <span className="text-display tracking-[0.3em] uppercase text-sm text-primary">
            {local.label}
          </span>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={local.enabled}
            onChange={(e) => setLocal({ ...local, enabled: e.target.checked })}
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
              checked={local.notify_hot}
              disabled={!local.enabled}
              onChange={(e) => setLocal({ ...local, notify_hot: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <Flame size={14} className="text-orange-400" />
            <span>For varmt over</span>
          </label>
          <TempPicker
            value={Math.round(Number(local.hot_threshold))}
            onChange={(v) => setLocal({ ...local, hot_threshold: v })}
            disabled={!local.enabled || !local.notify_hot}
            min={10}
            max={35}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={local.notify_cold}
              disabled={!local.enabled}
              onChange={(e) => setLocal({ ...local, notify_cold: e.target.checked })}
              className="accent-[var(--gold)]"
            />
            <Snowflake size={14} className="text-cyan-300" />
            <span>For kaldt under</span>
          </label>
          <TempPicker
            value={Math.round(Number(local.cold_threshold))}
            onChange={(v) => setLocal({ ...local, cold_threshold: v })}
            disabled={!local.enabled || !local.notify_cold}
            min={0}
            max={25}
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm">
            <Users size={14} className="text-[var(--gold)]" />
            <span>Mottaker</span>
          </div>
          <Select
            value={local.recipient}
            disabled={!local.enabled}
            onValueChange={(v) => setLocal({ ...local, recipient: v })}
          >
            <SelectTrigger className="h-8 w-[160px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WHO_OPTIONS.map((w) => (
                <SelectItem key={w} value={w}>
                  {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Pause mellom varsler</span>
          <Select
            value={String(local.cooldown_minutes)}
            disabled={!local.enabled}
            onValueChange={(v) => setLocal({ ...local, cooldown_minutes: Number(v) })}
          >
            <SelectTrigger className="h-8 w-[110px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">30 min</SelectItem>
              <SelectItem value="60">1 time</SelectItem>
              <SelectItem value="120">2 timer</SelectItem>
              <SelectItem value="240">4 timer</SelectItem>
              <SelectItem value="480">8 timer</SelectItem>
              <SelectItem value="1440">1 døgn</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[10px] text-muted-foreground italic">
          {local.last_value != null
            ? `Sist målt: ${Number(local.last_value).toFixed(1)}°`
            : "Ingen måling ennå"}
          {local.last_checked_at ? ` · ${new Date(local.last_checked_at).toLocaleTimeString("nb-NO", { hour: "2-digit", minute: "2-digit" })}` : ""}
        </p>
        <button
          type="button"
          disabled={!dirty}
          onClick={() => onSave(local)}
          className="text-[11px] uppercase tracking-[0.2em] px-3 py-1 rounded border border-[var(--gold)]/40 text-[var(--gold)] hover:bg-[var(--gold)]/10 disabled:opacity-30"
        >
          Lagre
        </button>
      </div>
    </article>
  );
}

export function ClimateNotificationSettings() {
  const qc = useQueryClient();
  const list = useServerFn(listClimatePrefs);
  const update = useServerFn(updateClimatePref);
  const runNow = useServerFn(runClimateNotifications);

  const { data, isLoading } = useQuery({
    queryKey: ["climate-prefs"],
    queryFn: () => list(),
  });

  const saveMut = useMutation({
    mutationFn: (p: ClimatePref) =>
      update({
        data: {
          id: p.id,
          enabled: p.enabled,
          notify_hot: p.notify_hot,
          hot_threshold: Number(p.hot_threshold),
          notify_cold: p.notify_cold,
          cold_threshold: Number(p.cold_threshold),
          recipient: p.recipient,
          cooldown_minutes: p.cooldown_minutes,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["climate-prefs"] }),
  });

  const runMut = useMutation({
    mutationFn: () => runNow(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["climate-prefs"] }),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Laster…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] px-3 py-1.5 rounded border border-primary/50 text-primary hover:bg-primary/10 disabled:opacity-50"
        >
          {runMut.isPending ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
          Kjør nå
        </button>
      </div>
      {runMut.data && (
        <p className="text-[11px] text-muted-foreground">
          Sjekket {(runMut.data as any).checked} rom · sendt {(runMut.data as any).sent} ·
          hoppet over {(runMut.data as any).skipped}
          {(runMut.data as any).details?.length
            ? ` (${(runMut.data as any).details
                .map((d: any) => `${d.room}: ${d.temp ?? "–"}° → ${d.action}`)
                .join(", ")})`
            : ""}
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        {(data ?? []).map((p) => (
          <RoomCard key={p.id} pref={p} onSave={(v) => saveMut.mutate(v)} />
        ))}
      </div>
    </div>
  );
}
