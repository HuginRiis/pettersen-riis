import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getNetatmoWeatherStation, type WeatherStationResult } from "@/lib/netatmo-weather.functions";
import { StuaConditionPanel } from "@/components/StuaConditionPanel";

const REFRESH_MS = 10 * 60_000;

export function HyttaIndreSal({ stationMatch = "hytta" }: { stationMatch?: string } = {}) {
  const fetchData = useServerFn(getNetatmoWeatherStation);
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ok"; data: Extract<WeatherStationResult, { ok: true }> }
    | { status: "error"; message: string }
  >({ status: "loading" });
  const inFlight = useRef(false);

  const load = async () => {
    if (inFlight.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    inFlight.current = true;
    try {
      const res = await fetchData({ data: { stationMatch } });
      if (res.ok) {
        setState({ status: "ok", data: res });
      } else {
        setState((prev) =>
          prev.status === "ok" ? prev : { status: "error", message: res.error },
        );
      }
    } catch (e: any) {
      setState((prev) =>
        prev.status === "ok"
          ? prev
          : { status: "error", message: e?.message ?? "Ukjent feil" },
      );
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationMatch]);

  // Indre sal = NAMain (hovedmodul inne)
  const indoor =
    state.status === "ok"
      ? state.data.modules.find((m) => m.type === "NAMain")
      : null;

  const sourceName =
    state.status === "ok"
      ? indoor
        ? `${state.data.stationName} — ${indoor.name}`
        : state.data.stationName
      : null;

  return (
    <StuaConditionPanel
      temperature={indoor?.metrics.temperature ?? null}
      humidity={indoor?.metrics.humidity ?? null}
      co2={indoor?.metrics.co2 ?? null}
      sourceName={sourceName}
      bare
    />
  );
}
