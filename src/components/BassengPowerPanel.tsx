import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Zap, Plug, Power, Footprints, Loader2 } from "lucide-react";
import { getBassengPowerStats } from "@/lib/basseng-power.functions";
import { setLivingRoomDeviceCapability } from "@/lib/homey.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type Stats = Awaited<ReturnType<typeof getBassengPowerStats>>;

function fmtKwh(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)} MWh`;
  if (v >= 10) return `${v.toFixed(1)} kWh`;
  return `${v.toFixed(2)} kWh`;
}

function fmtWatts(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000) return `${(v / 1000).toFixed(2)} kW`;
  return `${Math.round(v)} W`;
}

function fmtRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s} s siden`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t siden`;
  const d = Math.floor(h / 24);
  return `${d} d siden`;
}

function fmtClock(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("nb-NO", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function BassengPowerPanel() {
  const fetchStats = useServerFn(getBassengPowerStats);
  const setCap = useServerFn(setLivingRoomDeviceCapability);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingAction, setPendingAction] = useState<"on" | "off" | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const s = await fetchStats();
      setStats(s);
    } catch {
      /* ignorer */
    }
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const s = await fetchStats();
        if (!cancelled) setStats(s);
      } catch {
        /* ignorer */
      }
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fetchStats]);

  if (stats && !stats.ok) return null;

  const live = stats?.liveWatts ?? null;
  const activeNow = live !== null && live > 1;
  const heaterOn = stats?.isOn ?? null;
  const deviceId = stats?.deviceId ?? null;
  const lastMotion = stats?.lastMotion ?? null;

  const handleConfirm = async () => {
    if (!pendingAction || !deviceId) return;
    setBusy(true);
    try {
      const res = await setCap({
        data: { deviceId, capability: "onoff", value: pendingAction === "on" },
      });
      if (res?.ok) {
        toast.success(pendingAction === "on" ? "Basseng skrudd PÅ" : "Basseng skrudd AV");
        await refresh();
      } else {
        toast.error(res?.error ?? "Kommando feilet");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Kommando feilet");
    } finally {
      setBusy(false);
      setPendingAction(null);
    }
  };

  return (
    <section className="container mx-auto px-4 pt-3 sm:pt-4">
      <div className="panel rounded-lg p-4 sm:p-5 bg-gradient-to-br from-amber-500/10 to-transparent">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] sm:tracking-[0.3em] text-muted-foreground uppercase mb-0.5">
              Smedens regnskap
            </div>
            <h3 className="text-display text-primary text-sm sm:text-lg tracking-[0.2em] sm:tracking-[0.25em] uppercase flex items-center gap-2">
              <Plug size={14} className="text-[var(--gold)]" />
              Basseng — effekt &amp; forbruk
            </h3>
            {stats?.deviceName && (
              <div className="hidden sm:block text-[10px] tracking-[0.25em] uppercase text-muted-foreground/70 mt-1">
                {stats.deviceName}
              </div>
            )}
          </div>
          <div className={`text-right ${activeNow ? "text-amber-300" : "text-muted-foreground"}`}>
            <div className="flex items-center gap-1.5 justify-end">
              <Zap size={16} className={activeNow ? "animate-pulse" : ""} />
              <span className="text-2xl sm:text-3xl text-display tabular-nums leading-none">
                {fmtWatts(live)}
              </span>
            </div>
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] uppercase mt-1">
              {activeNow ? "Aktiv nå" : "Hviler"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="Siste døgn" value={stats ? fmtKwh(stats.kwh24h) : "—"} />
          <Stat label="Siste uke" value={stats ? fmtKwh(stats.kwh7d) : "—"} />
          <Stat label="Totalt" value={stats ? fmtKwh(stats.kwhTotal) : "—"} />
        </div>

        {/* Av/på + siste bevegelse */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
          <div className="rounded-md border border-border/60 bg-background/40 p-2 sm:p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[9px] sm:text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-0.5 flex items-center gap-1.5">
                <Power size={11} /> Basseng-bryter
              </div>
              <div className="text-xs sm:text-sm text-display tabular-nums">
                {heaterOn === null ? "—" : heaterOn ? "PÅ" : "AV"}
              </div>
            </div>
            <Button
              size="sm"
              variant={heaterOn ? "destructive" : "default"}
              disabled={!deviceId || heaterOn === null || busy}
              onClick={() => setPendingAction(heaterOn ? "off" : "on")}
              className="text-[10px] tracking-[0.2em] uppercase"
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : heaterOn ? (
                "Skru av"
              ) : (
                "Skru på"
              )}
            </Button>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-2 sm:p-3">
            <div className="text-[9px] sm:text-[10px] tracking-[0.25em] uppercase text-muted-foreground mb-0.5 flex items-center gap-1.5">
              <Footprints size={11} /> Siste bevegelse
            </div>
            {lastMotion ? (
              <>
                <div className="text-xs sm:text-sm text-display truncate">
                  {lastMotion.deviceName}
                  {lastMotion.zone ? (
                    <span className="text-muted-foreground"> · {lastMotion.zone}</span>
                  ) : null}
                </div>
                <div className="text-[10px] sm:text-xs text-muted-foreground tabular-nums">
                  {fmtClock(lastMotion.ts)} · {fmtRelative(lastMotion.ts)}
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground italic">Ingen registrert</div>
            )}
          </div>
        </div>

        {stats && stats.sampleCount < 5 && (
          <p className="text-[10px] sm:text-xs italic text-muted-foreground/80 mt-3">
            Samler målinger — tall blir mer presise etter noen timer.
          </p>
        )}
      </div>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(o) => !o && !busy && setPendingAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === "on" ? "Skru PÅ basseng-bryter?" : "Skru AV basseng-bryter?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === "on"
                ? "Er du sikker på at du vil skru PÅ varmen til bassenget? Dette vil starte strømforbruket."
                : "Er du sikker på at du vil skru AV varmen til bassenget? Vanntemperaturen vil falle over tid."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-2" />
                  Sender…
                </>
              ) : pendingAction === "on" ? (
                "Ja, skru PÅ"
              ) : (
                "Ja, skru AV"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-2 sm:p-3 text-center">
      <div className="text-[9px] sm:text-[10px] tracking-[0.2em] uppercase text-muted-foreground mb-1">
        {label}
      </div>
      <div className="text-sm sm:text-lg text-display tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}
