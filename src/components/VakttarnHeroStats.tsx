import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getVakttarnetHeroStatus, type VakttarnetHeroStatus } from "@/server/homey-sensor-dashboard.functions";
import { DoorClosed, Activity, Eye, Camera, ShieldCheck, ShieldOff, ShieldAlert } from "lucide-react";

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
  const outdoor = s.outdoorMotion ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] md:text-xs text-foreground/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
        {s.lastAlarmChange && (() => {
          const st = s.lastAlarmChange.state;
          const Icon = st === "disarmed" ? ShieldOff : st === "partially_armed" ? ShieldAlert : ShieldCheck;
          const tone = st === "disarmed" ? "border-amber-400/40 text-amber-300" : "border-emerald-400/40 text-emerald-300";
          const label = st === "disarmed" ? "Alarm av" : st === "partially_armed" ? "Delvis på" : "Alarm på";
          return (
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded bg-background/50 backdrop-blur-sm border ${tone}`}>
              <Icon size={12} />
              <span className="text-muted-foreground">{label}</span>
              <span className="font-semibold text-foreground">{minsAgo(s.lastAlarmChange.ts)}</span>
              {s.lastAlarmChange.who && (
                <span className="text-muted-foreground italic">· {s.lastAlarmChange.who}</span>
              )}
            </span>
          );
        })()}
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

      {outdoor.length > 0 && (
        <div className="rounded-md bg-background/50 backdrop-blur-sm border border-amber-400/30 px-2.5 py-1.5 max-w-md">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-amber-300 mb-1">
            <Eye size={11} />
            <span>Siste bevegelser ute</span>
          </div>
          <ul className="space-y-0.5 text-[11px] md:text-xs text-foreground/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
            {outdoor.map((o, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {o.source === "camera" ? (
                  <Camera size={11} className="text-amber-300 shrink-0" />
                ) : (
                  <Activity size={11} className="text-emerald-300 shrink-0" />
                )}
                <span className="font-semibold text-foreground truncate">{o.label}</span>
                {o.detail && o.detail !== o.label && (
                  <span className="text-muted-foreground italic truncate">· {o.detail}</span>
                )}
                <span className="text-muted-foreground ml-auto whitespace-nowrap">{minsAgo(o.ts)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
