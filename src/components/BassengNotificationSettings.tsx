import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Waves, ArrowUp, ArrowDown, Users, Send, Loader2, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendBassengTestPush } from "@/server/basseng-push.functions";
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

const DELTAS = [0.5, 1] as const;

type Pref = {
  id: string;
  label: string;
  device_match: string;
  enabled: boolean;
  delta: number;
  notify_up: boolean;
  notify_down: boolean;
  recipient_up: string;
  recipient_down: string;
  active_from: string;
  active_to: string;
  last_value: number | null;
  last_checked_at: string | null;
  last_notified_value: number | null;
  last_notified_at: string | null;
  last_direction: string | null;
};

export function BassengNotificationSettings() {
  const sendTest = useServerFn(sendBassengTestPush);
  const [pref, setPref] = useState<Pref | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("basseng_notification_prefs" as any)
      .select("*")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error) {
      setErr(error.message);
      return;
    }
    setPref(data as any);
  };

  useEffect(() => { void load(); }, []);

  const update = async (patch: Partial<Pref>) => {
    if (!pref) return;
    setPref({ ...pref, ...patch });
    setBusy("save");
    const { error } = await supabase
      .from("basseng_notification_prefs" as any)
      .update(patch as any)
      .eq("id", pref.id);
    setBusy(null);
    if (error) setMsg(`Feil: ${error.message}`);
  };

  const test = async () => {
    if (!pref) return;
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

  if (err) return <p className="text-rose-400 text-xs">{err}</p>;
  if (!pref) return <p className="text-muted-foreground text-xs">Laster…</p>;

  const lastStr = pref.last_checked_at
    ? new Date(pref.last_checked_at).toLocaleString("nb-NO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })
    : null;

  return (
    <article className="panel rounded-lg p-4 space-y-4">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waves size={16} className="text-[var(--gold)]" />
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
          <span className="text-sm">Endring som trigger varsel</span>
          <div className="inline-flex rounded-full border border-border/60 overflow-hidden">
            {DELTAS.map((d) => (
              <button
                key={d}
                type="button"
                disabled={!pref.enabled}
                onClick={() => update({ delta: d })}
                className={`px-3 py-1 text-xs tabular-nums ${
                  pref.delta === d
                    ? "bg-[var(--gold)]/20 text-[var(--gold)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ±{d}°
              </button>
            ))}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={pref.notify_up}
                disabled={!pref.enabled}
                onChange={(e) => update({ notify_up: e.target.checked })}
                className="accent-[var(--gold)]"
              />
              <ArrowUp size={14} className="text-orange-400" />
              <span>Når temperaturen stiger</span>
            </label>
            <div className="flex items-center gap-2 pl-6">
              <Users size={14} className="text-muted-foreground" />
              <Select
                value={pref.recipient_up}
                disabled={!pref.enabled || !pref.notify_up}
                onValueChange={(v) => update({ recipient_up: v })}
              >
                <SelectTrigger className="h-8 w-full text-sm">
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

          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={pref.notify_down}
                disabled={!pref.enabled}
                onChange={(e) => update({ notify_down: e.target.checked })}
                className="accent-[var(--gold)]"
              />
              <ArrowDown size={14} className="text-cyan-300" />
              <span>Når temperaturen synker</span>
            </label>
            <div className="flex items-center gap-2 pl-6">
              <Users size={14} className="text-muted-foreground" />
              <Select
                value={pref.recipient_down}
                disabled={!pref.enabled || !pref.notify_down}
                onValueChange={(v) => update({ recipient_down: v })}
              >
                <SelectTrigger className="h-8 w-full text-sm">
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
        </div>

        <div className="pt-2 border-t border-border/40 space-y-2">
          <div className="inline-flex items-center gap-2 text-sm">
            <Clock size={14} className="text-[var(--gold)]" />
            <span>Aktivt tidsrom (Oslo)</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={pref.active_from}
              disabled={!pref.enabled}
              onChange={(e) => update({ active_from: e.target.value })}
              className="bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
            />
            <span className="text-xs text-muted-foreground">til</span>
            <input
              type="time"
              value={pref.active_to}
              disabled={!pref.enabled}
              onChange={(e) => update({ active_to: e.target.value })}
              className="bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Støtter også over midnatt (f.eks. 22:00–06:00).
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border/40">
        <div className="text-[10px] text-muted-foreground">
          {pref.last_value != null ? (
            <>Nå: <span className="tabular-nums text-foreground">{pref.last_value.toFixed(1)}°</span></>
          ) : "Ingen måling ennå"}
          {pref.last_notified_value != null && (
            <span className="ml-2 opacity-70">· baseline {pref.last_notified_value.toFixed(1)}°</span>
          )}
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
        Sjekkes hvert 20. min via klima-cron. Varsel sendes når bassenget har endret
        seg ±{pref.delta}° siden forrige varsel, innenfor tidsrommet.
      </p>
    </article>
  );
}
