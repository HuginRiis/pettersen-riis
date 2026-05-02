import { createServerFn } from "@tanstack/react-start";
import { getValidConnection } from "./homey-connection";
import { getHomeyRawSnapshot } from "./homey";

export type EufyCameraInfo = {
  id: string;
  name: string;
  zone: string;
  driverUri: string;
  driverId: string;
  capabilities: string[];
  capabilityValues: Record<string, unknown>;
};

/**
 * One-shot inspector: list all Eufy cameras (or anything that looks like a camera)
 * with their capabilities, so we can decide whether polling is feasible.
 */
export const inspectEufyCameras = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    ok: boolean;
    error?: string;
    cameras: EufyCameraInfo[];
    candidates: EufyCameraInfo[];
  }> => {
    const conn = await getValidConnection();
    if (!conn) return { ok: false, error: "No Homey connection", cameras: [], candidates: [] };

    const snap = await getHomeyRawSnapshot(conn);
    if (!snap) return { ok: false, error: "Snapshot failed", cameras: [], candidates: [] };

    const zonesById: Record<string, string> = {};
    for (const z of snap.zones ?? []) zonesById[z.id] = z.name ?? "";

    const all: EufyCameraInfo[] = (snap.devices ?? []).map((d: any) => {
      const caps: string[] = Array.isArray(d.capabilities)
        ? d.capabilities
        : d.capabilities && typeof d.capabilities === "object"
        ? Object.keys(d.capabilities)
        : [];
      const capObj = d.capabilitiesObj ?? d.capabilities_obj ?? {};
      const values: Record<string, unknown> = {};
      for (const c of caps) {
        const v = capObj?.[c]?.value;
        if (v !== undefined) values[c] = v;
      }
      return {
        id: String(d.id ?? ""),
        name: String(d.name ?? ""),
        zone: zonesById[String(d.zone ?? "")] ?? "",
        driverUri: String(d.driverUri ?? d.driver_uri ?? ""),
        driverId: String(d.driverId ?? d.driver_id ?? ""),
        capabilities: caps,
        capabilityValues: values,
      };
    });

    const isEufy = (d: EufyCameraInfo) => {
      const blob = `${d.driverUri} ${d.driverId} ${d.name}`.toLowerCase();
      return blob.includes("eufy") || blob.includes("anker");
    };
    const looksLikeCamera = (d: EufyCameraInfo) =>
      d.capabilities.some((c) => c.startsWith("alarm_motion") || c === "camera_refresh" || c === "button.snapshot");

    const cameras = all.filter(isEufy);
    const candidates = cameras.length > 0 ? cameras : all.filter(looksLikeCamera);

    return { ok: true, cameras, candidates };
  }
);
