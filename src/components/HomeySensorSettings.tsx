import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getHomeySensorSettings,
  saveHomeySensorSettings,
  getHomeySensorSummarySettings,
  saveHomeySensorSummarySettings,
  sendHomeySensorSummaryTestPush,
  backfillHomeySensorHistoryFn,
  getHomeySensorHistorySettings,
  saveHomeySensorHistorySettingsFn,
} from "@/lib/homey.functions-sensor-dashboard.functions";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Activity, Loader2, Send, Save, Bell, BellOff, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";

const WHO_OPTIONS = ["Alle", "Arne & Rebekka", "Arne", "Rebekka", "Marita", "Nora", "Celine", "Mira"] as const;
const HISTORY_OPTIONS = [
  { value: "lastHour", label: "Siste time" },
  { value: "last6Hours", label: "Siste 6 timer" },
  { value: "last24Hours", label: "Siste 24 timer" },
  { value: "last7Days", label: "Siste 7 dager" },
  { value: "last31Days", label: "Siste 31 dager" },
] as const;

export function HomeySensorSettings() {
  const getDN = useServerFn(getHomeySensorSettings);
  const saveDN = useServerFn(saveHomeySensorSettings);
  const getSum = useServerFn(getHomeySensorSummarySettings);
  const saveSum = useServerFn(saveHomeySensorSummarySettings);
  const sendTest = useServerFn(sendHomeySensorSummaryTestPush);
  const getHistory = useServerFn(getHomeySensorHistorySettings);
  const saveHistory = useServerFn(saveHomeySensorHistorySettingsFn);
  const runBackfill = useServerFn(backfillHomeySensorHistoryFn);

  const [dayStart, setDayStart] = useState("06:00");
  const [dayEnd, setDayEnd] = useState("22:00");
  const [enabled, setEnabled] = useState(false);
  const [recipient, setRecipient] = useState<string>("Alle");
  const [hour, setHour] = useState(21);
  const [minute, setMinute] = useState(0);
  const [lastSent, setLastSent] = useState<string | null>(null);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [historyResolution, setHistoryResolution] = useState<(typeof HISTORY_OPTIONS)[number]["value"]>("last24Hours");
  const [historyInterval, setHistoryInterval] = useState(6);
  const [historyLastRun, setHistoryLastRun] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingDN, setSavingDN] = useState(false);
  const [testing, setTesting] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  useEffect(() => {
    Promise.all([getDN(), getSum(), getHistory()])
      .then(([dn, sum, history]) => {
        setDayStart(dn.dayStart);
        setDayEnd(dn.dayEnd);
        setEnabled(sum.enabled);
        setRecipient(sum.recipient);
        setHour(sum.hour);
        setMinute(sum.minute);
        setLastSent(sum.last_sent_date);
        setHistoryEnabled(history.enabled);
        setHistoryResolution(history.resolution);
        setHistoryInterval(history.interval_hours);
        setHistoryLastRun(history.last_run_at);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Klarte ikke laste"))
      .finally(() => setLoading(false));
  }, [getDN, getSum, getHistory]);

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

  async function patchHistory(p: Partial<{ enabled: boolean; resolution: typeof historyResolution; interval_hours: number }>) {
    try {
      const next = await saveHistory({ data: p });
      setHistoryEnabled(next.enabled);
      setHistoryResolution(next.resolution);
      setHistoryInterval(next.interval_hours);
      setHistoryLastRun(next.last_run_at);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    }
  }

  async function runManualHistory() {
    setBackfilling(true);
    try {
      const r = await runBackfill({ data: { resolution: historyResolution } });
      toast.success(
        r.ok
          ? `Historikk hentet: ${r.eventsInserted} hendelser fra ${r.sensorsProcessed} sensorer${r.errors ? `, ${r.errors} feil` : ""}.`
          : `Feil: ${r.error ?? "ukjent"}`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Feil");
    } finally {
      setBackfilling(false);
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

      {/* History backfill */}
      <div className="rounded-md border border-border/60 bg-background/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Historikk fra Homey</span>
          <span className="ml-auto flex items-center gap-2">
            <Switch checked={historyEnabled} onCheckedChange={(v) => patchHistory({ enabled: v })} />
            <span className="text-xs text-muted-foreground">Cron {historyEnabled ? "på" : "av"}</span>
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Hent gamle sensorhendelser manuelt, eller la dags-cron hente historikk automatisk med valgt periode.
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Periode:</span>
            <select
              value={historyResolution}
              onChange={(e) => patchHistory({ resolution: e.target.value as typeof historyResolution })}
              className="bg-background border border-border/60 rounded px-2 py-1 text-xs"
            >
              {HISTORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <span className="text-muted-foreground">Cron hver:</span>
            <input
              type="number"
              min={1}
              max={24}
              value={historyInterval}
              onChange={(e) => patchHistory({ interval_hours: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })}
              className="w-14 bg-background border border-border/60 rounded px-2 py-1 text-xs tabular-nums"
            />
            <span className="text-muted-foreground">t</span>
          </label>
          <div className="ml-auto">
            <Button size="sm" variant="outline" onClick={runManualHistory} disabled={backfilling} className="text-xs">
              {backfilling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Hent historikk nå
            </Button>
          </div>
        </div>
        {historyLastRun && (
          <p className="text-[10px] text-muted-foreground">Sist kjørt automatisk: {new Date(historyLastRun).toLocaleString("nb-NO")}</p>
        )}
      </div>
    </div>
  );
}
