import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Cake, Activity, Bell, BellOff, Save } from "lucide-react";

const WHO_OPTIONS = ["Alle", "Arne", "Rebekka", "Arne & Rebekka"] as const;

type BirthdayCfg = { hour: number; minute: number };
type TibberCfg = { enabled: boolean; hour: number; minute: number; recipient: string };

export function PushSchedulingSettings() {
  const [birthday, setBirthday] = useState<BirthdayCfg>({ hour: 8, minute: 0 });
  const [tibber, setTibber] = useState<TibberCfg>({ enabled: false, hour: 9, minute: 0, recipient: "Alle" });
  const [savingB, setSavingB] = useState(false);
  const [savingT, setSavingT] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("notification_settings")
      .select("key, value")
      .in("key", ["birthday_time", "tibber_missing"]);
    for (const row of data ?? []) {
      const v = (row as any).value ?? {};
      if ((row as any).key === "birthday_time") {
        setBirthday({ hour: v.hour ?? 8, minute: v.minute ?? 0 });
      } else if ((row as any).key === "tibber_missing") {
        setTibber({
          enabled: !!v.enabled,
          hour: v.hour ?? 9,
          minute: v.minute ?? 0,
          recipient: v.recipient || "Alle",
        });
      }
    }
  }

  async function saveBirthday() {
    setSavingB(true);
    setMsg(null);
    const { error } = await supabase
      .from("notification_settings")
      .upsert({ key: "birthday_time", value: birthday, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSavingB(false);
    setMsg(error ? `Feil: ${error.message}` : "Lagret bursdag-tid");
  }

  async function saveTibber() {
    setSavingT(true);
    setMsg(null);
    const { error } = await supabase
      .from("notification_settings")
      .upsert({ key: "tibber_missing", value: tibber, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSavingT(false);
    setMsg(error ? `Feil: ${error.message}` : "Lagret Tibber-varsel");
  }

  return (
    <section className="pt-4 grid md:grid-cols-2 gap-4">
      {/* Bursdag */}
      <article className="panel rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Cake size={20} className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-foreground font-semibold">Bursdager — klokkeslett</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tidspunkt push sendes på selve bursdagen (Europe/Oslo).
            </p>
            <div className="flex items-center gap-2 mt-3">
              <input
                type="number"
                min={0}
                max={23}
                value={birthday.hour}
                onChange={(e) => setBirthday((p) => ({ ...p, hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) }))}
                className="w-16 bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-muted-foreground">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={birthday.minute}
                onChange={(e) => setBirthday((p) => ({ ...p, minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) }))}
                className="w-16 bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
              />
              <button
                onClick={() => void saveBirthday()}
                disabled={savingB}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-primary/60 text-primary text-xs uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
              >
                <Save size={12} /> {savingB ? "Lagrer…" : "Lagre"}
              </button>
            </div>
          </div>
        </div>
      </article>

      {/* Tibber missing */}
      <article className="panel rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Activity size={20} className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-foreground font-semibold">Tibber — manglende data</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Push hvis daglig kWh-snapshot for i går mangler for Tollnes eller Hytta.
            </p>
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <button
                onClick={() => setTibber((p) => ({ ...p, enabled: !p.enabled }))}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs uppercase tracking-wider transition ${
                  tibber.enabled ? "border-primary/60 text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {tibber.enabled ? <Bell size={12} /> : <BellOff size={12} />}
                {tibber.enabled ? "På" : "Av"}
              </button>
              <input
                type="number"
                min={0}
                max={23}
                value={tibber.hour}
                onChange={(e) => setTibber((p) => ({ ...p, hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) }))}
                className="w-16 bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
              />
              <span className="text-muted-foreground">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={tibber.minute}
                onChange={(e) => setTibber((p) => ({ ...p, minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) }))}
                className="w-16 bg-background border border-border/60 rounded px-2 py-1 text-sm tabular-nums"
              />
              <select
                value={tibber.recipient}
                onChange={(e) => setTibber((p) => ({ ...p, recipient: e.target.value }))}
                className="bg-background border border-border/60 rounded px-2 py-1 text-xs"
              >
                {WHO_OPTIONS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              <button
                onClick={() => void saveTibber()}
                disabled={savingT}
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-primary/60 text-primary text-xs uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
              >
                <Save size={12} /> {savingT ? "Lagrer…" : "Lagre"}
              </button>
            </div>
          </div>
        </div>
        {msg && <p className="text-[11px] text-muted-foreground mt-2">{msg}</p>}
      </article>
    </section>
  );
}
