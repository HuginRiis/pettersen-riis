import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGardenaSnapshot } from "@/server/gardena.functions";
import { Bot, Battery, Signal, AlertTriangle, MapPin, Droplets, Plug } from "lucide-react";

function fmt(v: any): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "ja" : "nei";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "object") {
    if ("value" in v) return fmt((v as any).value);
    return JSON.stringify(v);
  }
  return String(v);
}

function flatten(obj: any, prefix = ""): Array<[string, any]> {
  const out: Array<[string, any]> = [];
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !("value" in (v as any))) {
      out.push(...flatten(v, key));
    } else {
      out.push([key, v]);
    }
  }
  return out;
}

function deviceIcon(type: string) {
  if (type === "MOWER") return Bot;
  if (type === "VALVE" || type === "VALVE_SET") return Droplets;
  if (type === "POWER_SOCKET") return Plug;
  return Bot;
}

export function GardenaPanel() {
  const fetchSnap = useServerFn(getGardenaSnapshot);
  const { data, isLoading, error } = useQuery({
    queryKey: ["gardena-snapshot"],
    queryFn: () => fetchSnap(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  if (isLoading) return null;

  const totalDevices = data?.locations.reduce((n, l) => n + l.devices.length, 0) ?? 0;

  return (
    <section className="container mx-auto px-4 py-12">
      <div className="ornate-divider mb-6 flex items-center justify-between gap-3">
        <span className="text-display tracking-[0.3em] text-primary text-sm uppercase">
          Gardena Smart System
        </span>
        <span className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
          {totalDevices} {totalDevices === 1 ? "enhet" : "enheter"}
        </span>
      </div>

      {error && (
        <div className="panel rounded-lg p-4 text-sm text-destructive">
          Kunne ikke laste Gardena: {String((error as Error).message)}
        </div>
      )}

      {data && !data.ok && (
        <div className="panel rounded-lg p-4 text-sm text-destructive flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>{data.error}</span>
        </div>
      )}

      {data?.ok && data.locations.length === 0 && (
        <div className="panel rounded-lg p-4 text-sm text-muted-foreground">
          Ingen Gardena-steder funnet på kontoen.
        </div>
      )}

      {data?.ok &&
        data.locations.map((loc) => (
          <div key={loc.id} className="mb-8">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <MapPin size={12} />
              <span className="uppercase tracking-[0.2em]">{loc.name}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {loc.devices.map((d) => {
                const Icon = deviceIcon(d.type);
                const all = flatten(d.raw);
                return (
                  <div key={d.id} className="panel rounded-lg p-5 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className="text-primary shrink-0" />
                          <h3 className="text-sm font-medium truncate">{d.name}</h3>
                        </div>
                        <p className="text-[10px] tracking-[0.25em] text-muted-foreground uppercase mt-1">
                          {d.type}
                          {d.modelType ? ` · ${d.modelType}` : ""}
                        </p>
                      </div>
                    </div>

                    {d.state && (
                      <div className="text-xs px-3 py-2 rounded border border-primary/30 bg-primary/10 text-primary uppercase tracking-[0.15em]">
                        {d.state.replaceAll("_", " ").toLowerCase()}
                        {d.activity ? ` · ${d.activity.replaceAll("_", " ").toLowerCase()}` : ""}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <Battery size={16} className="text-primary/70" />
                        <div>
                          <div className="tabular-nums">
                            {d.battery?.level !== null && d.battery?.level !== undefined ? `${d.battery.level}%` : "—"}
                          </div>
                          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                            {d.battery?.state ?? "Batteri"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Signal size={16} className="text-primary/70" />
                        <div>
                          <div className="tabular-nums">
                            {d.rfLink?.level !== null && d.rfLink?.level !== undefined ? `${d.rfLink.level}%` : "—"}
                          </div>
                          <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
                            {d.rfLink?.state ?? "Signal"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {d.lastErrorCode && d.lastErrorCode !== "NO_MESSAGE" && (
                      <div className="flex items-start gap-2 text-xs text-amber-400 border border-amber-400/30 bg-amber-400/10 rounded px-3 py-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <div>Sist feil: {d.lastErrorCode}</div>
                      </div>
                    )}

                    {d.operatingHours !== null && d.operatingHours !== undefined && (
                      <div className="text-xs text-muted-foreground">
                        Driftstimer: <span className="text-foreground tabular-nums">{d.operatingHours}</span>
                      </div>
                    )}

                    {d.serial && (
                      <div className="text-[10px] text-muted-foreground font-mono truncate">
                        SN {d.serial}
                      </div>
                    )}

                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer text-[10px] tracking-[0.25em] uppercase hover:text-primary">
                        Alle verdier ({all.length})
                      </summary>
                      <div className="mt-2 grid grid-cols-1 gap-1 max-h-64 overflow-auto pr-1">
                        {all
                          .sort((a, b) => a[0].localeCompare(b[0]))
                          .map(([k, v]) => (
                            <div key={k} className="flex items-baseline justify-between gap-3 border-b border-border/30 py-1">
                              <span className="font-mono text-[10px] truncate">{k}</span>
                              <span className="tabular-nums text-foreground text-right truncate max-w-[55%]">
                                {fmt(v)}
                              </span>
                            </div>
                          ))}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
    </section>
  );
}
