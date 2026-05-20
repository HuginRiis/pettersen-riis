import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getHomeySensorSettings,
  saveHomeySensorSettings,
  getHomeySensorSummarySettings,
  saveHomeySensorSummarySettings,
  sendHomeySensorSummaryTestPush,
} from "@/server/homey-sensor-dashboard.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Activity, Loader2, Send, Save, Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;

export function HomeySensorSettings() {
  const getDN = useServerFn(getHomeySensorSettings);
  const saveDN = useServerFn(saveHomeySensorSettings);
  const getSum = useServerFn(getHomeySensorSummarySettings);
  const saveSum = useServerFn(saveHomeySensorSummarySettings);
  const sendTest = useServerFn(sendHomeySensorSummaryTestPush);

  const [dayStart, setDayStart] = useState("06:00");
  const [dayEnd, setDayEnd] = useState("22:00");
  const [enabled, setEnabled] = useState(false);
  const [recipient, setRecipient] = useState<string>("Alle");
  const [hour, setHour] = useState(21);
  const [minute, setMinute] = useState(0);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDN, setSavingDN] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    Promise.all([getDN(), getSum()])
      .then(([dn, sum]) => {
        setDayStart(dn.dayStart);
        setDayEnd(dn.dayEnd);
        setEnabled(sum.enabled);
        setRecipient(sum.recipient);
        setHour(sum.hour);
        setMinute(sum.minute);
        setLastSent(sum.last_sent_date);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Klarte ikke laste"))
      .finally(() => setLoading(false));
  }, [getDN, getSum]);

  async function saveDayNight() {
    setSavingDN(true);
    try {
      await saveDN({ data: { dayStart, dayEnd } });
      toast.success("Dag/natt lagret");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setSavingDN(false);
    }
  }

  async function patchSum(p: Partial<{ enabled: boolean; recipient: string; hour: number; minute: number }>) {
    try {
      const next = await saveSum({ data: p });
      setEnabled(next.enabled);
      setRecipient(next.recipient);
      setHour(next.hour);
      setMinute(next.minute);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  async function test() {
    setTesting(true);
    try {
      const r = await sendTest();
      toast.success(`Sendt: ${r.sent}, feil: ${r.errors}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Laster…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day/night */}
      <div className="rounded-md border border-border/60 bg-background/40 p-3">
        <div className="text-[11px] text-muted-foreground mb-2">
          Definer når dagen begynner og slutter — brukes til natt/dag-analyse i Sensor-dashboardet på Vakttårnet.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Dag starter
            <input
              type="time"
              value={dayStart}
              onChange={(e) => setDayStart(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Dag slutter
            <input
              type="time"
              value={dayEnd}
              onChange={(e) => setDayEnd(e.target.value)}
              className="bg-background border border-border rounded px-2 py-1 text-sm text-foreground"
            />
          </label>
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="outline" onClick={saveDayNight} disabled={savingDN} className="text-xs">
            {savingDN ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
            Lagre dag/natt
          </Button>
        </div>
      </div>

      {/* Daily summary push */}
      <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Dagsoppsummering — push</span>
          <span className="ml-auto flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={(v) => patchSum({ enabled: v })} />
            <span className="text-xs text-muted-foreground">
              {enabled ? <Bell className="inline h-3 w-3" /> : <BellOff className="inline h-3 w-3" />} {enabled ? "På" : "Av"}
            </span>
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Sender én daglig push med antall bevegelser, døråpninger, vinduer, lås opp og mest aktivt rom for valgt tidspunkt (Oslo-tid).
        </p>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Mottaker:</span>
            <select
              value={recipient}
              onChange={(e) => patchSum({ recipient: e.target.value })}
              className="bg-background border border-border/60 rounded px-2 py-1 text-xs"
            >
              {WHO_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Kl:</span>
            <input
              type="number" min={0} max={23}
              value={hour}
              onChange={(e) => patchSum({ hour: Math.max(0, Math.min(23, Number(e.target.value) || 0)) })}
              className="w-14 bg-background border border-border/60 rounded px-2 py-1 text-xs tabular-nums"
            />
            <span>:</span>
            <input
              type="number" min={0} max={59}
              value={minute}
              onChange={(e) => patchSum({ minute: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
              className="w-14 bg-background border border-border/60 rounded px-2 py-1 text-xs tabular-nums"
            />
          </label>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={test} disabled={testing} className="text-xs">
              {testing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
              Test push
            </Button>
          </div>
        </div>

        {lastSent && (
          <p className="text-[10px] text-muted-foreground">Sist sendt: {lastSent}</p>
        )}
      </div>
    </div>
  );
}
