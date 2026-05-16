import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getPushQuietHours,
  setPushQuietHours,
  deletePushQuietHours,
} from "@/server/push-quiet-hours.functions";
import { Moon, Save, Trash2, Plus } from "lucide-react";

const RECIPIENTS = ["Alle", "Arne", "Rebekka", "Ada", "Noah", "Petter", "Mor", "Far"];

type Row = {
  recipient: string;
  enabled: boolean;
  weekday_start: string;
  weekday_end: string;
  weekend_start: string;
  weekend_end: string;
};

const DEFAULT: Omit<Row, "recipient"> = {
  enabled: true,
  weekday_start: "22:00",
  weekday_end: "07:00",
  weekend_start: "23:00",
  weekend_end: "09:00",
};

function trim(t: string): string {
  // db kan returnere HH:MM:SS, input type="time" vil ha HH:MM
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export function PushQuietHoursPanel() {
  const fetchRows = useServerFn(getPushQuietHours);
  const saveRow = useServerFn(setPushQuietHours);
  const deleteRow = useServerFn(deletePushQuietHours);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [addRecipient, setAddRecipient] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchRows();
      setRows((r.rows ?? []).map((x: any) => ({
        recipient: x.recipient,
        enabled: !!x.enabled,
        weekday_start: trim(x.weekday_start),
        weekday_end: trim(x.weekday_end),
        weekend_start: trim(x.weekend_start),
        weekend_end: trim(x.weekend_end),
      })));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const update = (rec: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.recipient === rec ? { ...r, ...patch } : r)));

  const onSave = async (row: Row) => {
    setSaving(row.recipient);
    setMsg(null);
    try {
      await saveRow({ data: row });
      setMsg(`Lagret ${row.recipient} ✓`);
      setTimeout(() => setMsg(null), 2500);
    } catch (e: any) {
      setMsg(`Feil: ${e?.message ?? e}`);
    } finally { setSaving(null); }
  };

  const onDelete = async (rec: string) => {
    setSaving(rec);
    try {
      await deleteRow({ data: { recipient: rec } });
      setRows((rs) => rs.filter((r) => r.recipient !== rec));
    } finally { setSaving(null); }
  };

  const onAdd = async () => {
    if (!addRecipient) return;
    if (rows.some((r) => r.recipient === addRecipient)) {
      setMsg("Finnes allerede");
      return;
    }
    const row: Row = { recipient: addRecipient, ...DEFAULT };
    setRows((rs) => [...rs, row].sort((a, b) => a.recipient.localeCompare(b.recipient, "nb")));
    setAddRecipient("");
    await onSave(row);
  };

  const remaining = RECIPIENTS.filter((r) => !rows.some((x) => x.recipient === r));

  return (
    <section className="container mx-auto px-4 pt-4">
      <article className="panel rounded-lg p-4 border border-primary/30">
        <div className="flex items-start gap-3">
          <Moon size={20} className="text-primary mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-foreground font-semibold">Stille timer for push</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Tidsvindu der ingen push-varsler sendes. Egne tider for hverdag (man–fre) og
              helg (lør–søn). Sett pr. mottaker eller bruk «Alle» som gjelder alle.
              Tider tolkes i Europe/Oslo. Vindu som krysser midnatt støttes (f.eks. 22:00–07:00).
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-muted-foreground mt-4">Laster…</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {rows.length === 0 && (
              <p className="text-xs text-muted-foreground">Ingen regler ennå.</p>
            )}
            {rows.map((row) => (
              <div key={row.recipient} className="panel rounded p-3 border border-border/50">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => update(row.recipient, { enabled: e.target.checked })}
                      className="accent-primary"
                    />
                    <span className="font-medium">{row.recipient}</span>
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {row.enabled ? "aktiv" : "av"}
                    </span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void onSave(row)}
                      disabled={saving === row.recipient}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-primary/60 text-primary text-xs uppercase tracking-wider hover:bg-primary/10 disabled:opacity-50"
                    >
                      <Save size={12} /> {saving === row.recipient ? "Lagrer…" : "Lagre"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDelete(row.recipient)}
                      disabled={saving === row.recipient}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-border text-muted-foreground text-xs hover:text-destructive hover:border-destructive/60"
                      title="Fjern regel"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <div className="rounded border border-border/50 p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Hverdag (man–fre)</p>
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="time"
                        value={row.weekday_start}
                        onChange={(e) => update(row.recipient, { weekday_start: e.target.value })}
                        className="bg-background border border-border rounded px-2 py-1"
                      />
                      <span className="text-muted-foreground">–</span>
                      <input
                        type="time"
                        value={row.weekday_end}
                        onChange={(e) => update(row.recipient, { weekday_end: e.target.value })}
                        className="bg-background border border-border rounded px-2 py-1"
                      />
                    </div>
                  </div>
                  <div className="rounded border border-border/50 p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Helg (lør–søn)</p>
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="time"
                        value={row.weekend_start}
                        onChange={(e) => update(row.recipient, { weekend_start: e.target.value })}
                        className="bg-background border border-border rounded px-2 py-1"
                      />
                      <span className="text-muted-foreground">–</span>
                      <input
                        type="time"
                        value={row.weekend_end}
                        onChange={(e) => update(row.recipient, { weekend_end: e.target.value })}
                        className="bg-background border border-border rounded px-2 py-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {remaining.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <select
              value={addRecipient}
              onChange={(e) => setAddRecipient(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm"
            >
              <option value="">Legg til mottaker…</option>
              {remaining.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void onAdd()}
              disabled={!addRecipient}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-primary text-primary-foreground text-xs hover:opacity-90 disabled:opacity-50"
            >
              <Plus size={12} /> Legg til
            </button>
          </div>
        )}

        {msg && <p className="text-xs text-emerald-400 mt-2">{msg}</p>}
      </article>
    </section>
  );
}
