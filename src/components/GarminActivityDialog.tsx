import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MapPin, Timer, TrendingUp, Heart, Flame, Gauge, Mountain, Route as RouteIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { RouteMap } from "@/components/RouteMap";
import { getGarminActivityDetail } from "@/lib/garmin.functions";

type Owner = "arne" | "rebekka";

function fmtKm(m?: number | null): string {
  if (!m) return "—";
  return `${(m / 1000).toFixed(2)} km`;
}
function fmtDur(s?: number | null): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  if (h > 0) return `${h}t ${m}m`;
  return `${m}m ${sec}s`;
}
function fmtSpeed(mps?: number | null): string {
  if (!mps) return "—";
  return `${(mps * 3.6).toFixed(1)} km/t`;
}
function fmtPace(distanceM?: number | null, seconds?: number | null): string {
  if (!distanceM || !seconds || distanceM < 10) return "—";
  const paceSec = seconds / (distanceM / 1000);
  const m = Math.floor(paceSec / 60);
  const s = Math.round(paceSec % 60);
  return `${m}:${String(s).padStart(2, "0")} min/km`;
}
function fmtDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("nb-NO", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function GarminActivityDialog({
  activityId,
  owner,
  open,
  onOpenChange,
  fallbackName,
  fallbackType,
}: {
  activityId: number;
  owner: Owner;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fallbackName?: string;
  fallbackType?: string;
}) {
  const fetchDetail = useServerFn(getGarminActivityDetail);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; data: Awaited<ReturnType<typeof getGarminActivityDetail>> }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setState({ kind: "loading" });
    fetchDetail({ data: { activityId, owner } })
      .then((res) => {
        if (cancelled) return;
        setState({ kind: "ok", data: res });
      })
      .catch((e) => {
        if (!cancelled) setState({ kind: "error", message: e?.message ?? "Ukjent feil" });
      });
    return () => { cancelled = true; };
  }, [open, activityId, owner, fetchDetail]);

  const row = (state.kind === "ok" ? state.data.row : null) as
    | {
        activity_name: string | null; activity_type: string | null;
        start_time_local: string;
        duration_seconds: number | null; distance_meters: number | null;
        calories: number | null; average_hr: number | null; max_hr: number | null;
        elevation_gain: number | null; average_speed: number | null;
      }
    | null;
  const live = (state.kind === "ok" ? state.data.liveSummary : null) as
    | {
        distance?: number; duration?: number; elevationGain?: number; elevationLoss?: number;
        averageSpeed?: number; maxSpeed?: number; averageHR?: number; maxHR?: number;
        calories?: number; minElevation?: number; maxElevation?: number;
        averagePower?: number; maxPower?: number;
        startLatitude?: number; startLongitude?: number;
      }
    | null;
  const coords = (state.kind === "ok" ? state.data.coords : []) as [number, number][];
  const series = (state.kind === "ok" ? state.data.series : null) as {
    elevation: Array<number | null>;
    speedKmh: Array<number | null>;
    heartRate: Array<number | null>;
    timestamps: Array<number | null>;
  } | null;


  const name = row?.activity_name ?? fallbackName ?? "Økt";
  const type = row?.activity_type ?? fallbackType ?? "";
  const isRun = type.toLowerCase().includes("run");

  const distance = live?.distance ?? row?.distance_meters ?? null;
  const duration = live?.duration ?? row?.duration_seconds ?? null;
  const elevation = live?.elevationGain ?? row?.elevation_gain ?? null;
  const avgHr = live?.averageHR ?? row?.average_hr ?? null;
  const maxHr = live?.maxHR ?? row?.max_hr ?? null;
  const avgSpeed = live?.averageSpeed ?? row?.average_speed ?? null;
  const maxSpeed = live?.maxSpeed ?? null;
  const calories = live?.calories ?? row?.calories ?? null;
  const minElev = live?.minElevation ?? null;
  const maxElev = live?.maxElevation ?? null;
  const elevLoss = live?.elevationLoss ?? null;
  const avgPower = live?.averagePower ?? null;
  const maxPower = live?.maxPower ?? null;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-medieval text-primary">
            {name}
          </DialogTitle>
          <DialogDescription className="text-xs uppercase tracking-[0.2em]">
            {type} · {fmtDate(row?.start_time_local)}
          </DialogDescription>
        </DialogHeader>

        {state.kind === "loading" && (
          <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Henter detaljer fra Garmin…
          </div>
        )}
        {state.kind === "error" && (
          <div className="py-8 text-center text-sm text-destructive">Feil: {state.message}</div>
        )}

        {state.kind === "ok" && (
          <div className="space-y-4">
            <div className="aspect-[16/9] w-full rounded-md overflow-hidden border border-border/60">
              <RouteMap coords={coords} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric icon={<RouteIcon size={12} />} label="Distanse" value={fmtKm(distance)} />
              <Metric icon={<Timer size={12} />} label="Tid" value={fmtDur(duration)} />
              <Metric
                icon={<Gauge size={12} />}
                label={isRun ? "Tempo" : "Snittfart"}
                value={isRun ? fmtPace(distance, duration) : fmtSpeed(avgSpeed)}
              />
              <Metric icon={<Gauge size={12} />} label="Maksfart" value={fmtSpeed(maxSpeed)} />
              <Metric icon={<TrendingUp size={12} />} label="Stigning" value={elevation != null ? `${Math.round(elevation)} m` : "—"} />
              <Metric icon={<Mountain size={12} />} label="Nedstigning" value={elevLoss != null ? `${Math.round(elevLoss)} m` : "—"} />
              <Metric icon={<Mountain size={12} />} label="Høyde" value={minElev != null && maxElev != null ? `${Math.round(minElev)}–${Math.round(maxElev)} m` : "—"} />
              <Metric icon={<Heart size={12} />} label="Puls snitt" value={avgHr ? `${avgHr} bpm` : "—"} />
              <Metric icon={<Heart size={12} />} label="Puls maks" value={maxHr ? `${maxHr} bpm` : "—"} />
              <Metric icon={<Flame size={12} />} label="Kalorier" value={calories ? `${calories} kcal` : "—"} />
              {avgPower ? <Metric icon={<Gauge size={12} />} label="Watt snitt" value={`${Math.round(avgPower)} W`} /> : null}
              {maxPower ? <Metric icon={<Gauge size={12} />} label="Watt maks" value={`${Math.round(maxPower)} W`} /> : null}
              {live?.startLatitude != null && live?.startLongitude != null ? (
                <Metric
                  icon={<MapPin size={12} />}
                  label="Start"
                  value={`${live.startLatitude.toFixed(4)}, ${live.startLongitude.toFixed(4)}`}
                />
              ) : null}
            </div>

            {coords.length === 0 && (
              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground text-center">
                Ingen GPS-punkter på denne økta (f.eks. innendørs / manuelt registrert).
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded border border-primary/20 bg-background/40 p-2">
      <div className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1">
        {icon}{label}
      </div>
      <div className="text-sm text-primary tabular-nums mt-1 truncate">{value}</div>
    </div>
  );
}
