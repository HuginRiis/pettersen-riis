import { createServerFn } from "@tanstack/react-start";

const TOLLNES = { lat: 59.1789, lon: 9.5732 };

// ============================================================
// MET.NO RADAR (sør-Norge, 5-nivå reflectivity = nedbørsintensitet)
// ============================================================

export type RadarResult =
  | { ok: false; error: string }
  | {
      ok: true;
      dataUrl: string;
      capturedAt: string;
      area: "southern_norway";
    };

const MET_UA = "house-riis-pettersen/1.0 (https://riis.cc)";

function bufferToDataUrl(buffer: ArrayBuffer, contentType: string) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

function parseRadarTimestamp(disposition: string | null): string {
  // content-disposition: inline;filename="web5color-sornorge_20260418T070000Z.png"
  if (!disposition) return new Date().toISOString();
  const m = disposition.match(/(\d{8})T(\d{6})Z/);
  if (!m) return new Date().toISOString();
  const d = m[1];
  const t = m[2];
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6)}Z`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

export const getMetRadarSouthernNorway = createServerFn({ method: "GET" }).handler(
  async (): Promise<RadarResult> => {
    try {
      const res = await fetch(
        "https://api.met.no/weatherapi/radar/2.0/?type=5level_reflectivity&area=southern_norway&content=image",
        { headers: { "User-Agent": MET_UA, Accept: "image/png" } },
      );
      if (!res.ok) {
        return { ok: false, error: `Radar feilet (${res.status})` };
      }
      const ct = res.headers.get("content-type") ?? "image/png";
      const disposition = res.headers.get("content-disposition");
      const buf = await res.arrayBuffer();
      return {
        ok: true,
        dataUrl: bufferToDataUrl(buf, ct.split(";")[0]),
        capturedAt: parseRadarTimestamp(disposition),
        area: "southern_norway",
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  },
);

// ============================================================
// MET.NO METALERTS (offisielle varsler — torden, regn, vind etc.)
// ============================================================

export type MetAlert = {
  id: string;
  event: string; // f.eks. "thunderstorm", "rain", "wind"
  title: string;
  description: string;
  severity: "Minor" | "Moderate" | "Severe" | "Extreme" | string;
  certainty: string;
  awarenessLevel: string; // "2; yellow; Moderate"
  awarenessColor: "yellow" | "orange" | "red" | "green" | string;
  start: string;
  end: string;
  area: string;
  isThunder: boolean;
};

export type AlertsResult =
  | { ok: false; error: string }
  | {
      ok: true;
      alerts: MetAlert[];
      lastChange: string;
    };

function parseAwareness(raw: string | undefined): {
  level: string;
  color: string;
} {
  if (!raw) return { level: "1", color: "green" };
  // Format: "2; yellow; Moderate"
  const parts = raw.split(";").map((p) => p.trim());
  return {
    level: parts[0] ?? "1",
    color: (parts[1] ?? "green").toLowerCase(),
  };
}

export const getTollnesAlerts = createServerFn({ method: "GET" }).handler(
  async (): Promise<AlertsResult> => {
    try {
      const url = `https://api.met.no/weatherapi/metalerts/2.0/current.json?lat=${TOLLNES.lat}&lon=${TOLLNES.lon}`;
      const res = await fetch(url, {
        headers: { "User-Agent": MET_UA, Accept: "application/json" },
      });
      if (!res.ok) {
        return { ok: false, error: `MetAlerts feilet (${res.status})` };
      }
      const json = (await res.json()) as any;
      const features: any[] = Array.isArray(json?.features) ? json.features : [];

      const alerts: MetAlert[] = features.map((f, i) => {
        const props = f?.properties ?? {};
        const awareness = parseAwareness(props.awareness_level);
        const event: string = String(props.event ?? "").toLowerCase();
        const title: string = props.eventAwarenessName ?? props.event ?? "Varsel";
        const desc: string = props.description ?? props.instruction ?? "";
        return {
          id: props.id ?? `alert-${i}`,
          event,
          title,
          description: desc,
          severity: props.severity ?? "Minor",
          certainty: props.certainty ?? "Unknown",
          awarenessLevel: awareness.level,
          awarenessColor: awareness.color,
          start: props.eventEndingTime ? props.onset ?? props.effective ?? "" : props.onset ?? "",
          end: props.eventEndingTime ?? props.expires ?? "",
          area: props.area ?? "",
          isThunder:
            event.includes("thunder") ||
            event.includes("torden") ||
            (typeof title === "string" && title.toLowerCase().includes("torden")),
        };
      });

      return {
        ok: true,
        alerts,
        lastChange: json?.lastChange ?? new Date().toISOString(),
      };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? "Ukjent feil" };
    }
  },
);
