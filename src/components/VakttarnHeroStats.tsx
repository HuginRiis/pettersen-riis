import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVakttarnetHeroStatus, type VakttarnetHeroStatus } from "@/server/homey-sensor-dashboard.functions";
import { DoorClosed, Activity } from "lucide-react";

function minsAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.max(0, Math.floor(diff / 60_000));
  if (m < 1) return "akkurat nå";
  if (m < 60) return `${m} min siden`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} t ${m % 60} min siden`;
  return `${Math.floor(h / 24)} d siden`;
}

export function VakttarnHeroStats() {
  const fetchFn = useServerFn(getVakttarnetHeroStatus);
  const [s, setS] = useState<VakttarnetHeroStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => fetchFn().then((d) => { if (alive) setS(d); }).catch(() => {});
    load();
    const i = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(i); };
  }, [fetchFn]);
  if (!s) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] md:text-xs text-foreground/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
      {s.lastDoorClose && (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-background/50 backdrop-blur-sm border border-primary/30">
          <DoorClosed size={12} className="text-primary" />
          <span className="text-muted-foreground">Dør lukket</span>
          <span className="font-semibold text-foreground">{minsAgo(s.lastDoorClose.ts)}</span>
          <span className="text-muted-foreground italic">· {s.lastDoorClose.device_name}</span>
        </span>
      )}
      {s.lastSensor && (
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-background/50 backdrop-blur-sm border border-emerald-400/30">
          <Activity size={12} className="text-emerald-400" />
          <span className="text-muted-foreground">Siste sensor</span>
          <span className="font-semibold text-foreground">{s.lastSensor.device_name}</span>
          <span className="text-muted-foreground">· {minsAgo(s.lastSensor.ts)}</span>
        </span>
      )}
    </div>
  );
}
