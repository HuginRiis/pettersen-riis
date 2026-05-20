import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadSummaryConfig,
  saveSummaryConfig,
  sendHomeySensorSummaryTest,
} from "./homey-sensor-summary.server";
import { backfillHomeySensorHistory } from "./homey-sensor-backfill.server";

export type SensorRange = "today" | "yesterday" | "week" | "last7";

export type HomeySensorDashboard = {
  rangeStart: string;
  rangeEnd: string;
  totals: {
    motion: number;
    door_open: number;
    door_close: number;
    window_open: number;
    window_close: number;
    locked: number;
    unlocked: number;
    all: number;
  };
  topRoom: { zone: string; count: number } | null;
  topRooms: Array<{ zone: string; count: number }>;
  lastMotion: { ts: string; device: string; zone: string | null } | null;
  hourly: Array<{ hour: number; motion: number; door: number; lock: number; window: number }>;
  daily: Array<{ label: string; date: string; motion: number; door: number; lock: number; window: number }>;
  byRoom: Array<{ zone: string; motion: number; door: number; lock: number; window: number; total: number }>;
  dayNight: { day: number; night: number };
  peakHours: Array<{ hour: number; count: number }>;
  inactiveSensors: Array<{ device_name: string; zone: string | null; kind: string; last_ts: string }>;
  inactiveMotion: Array<{ device_name: string; zone: string | null; last_ts: string; days: number }>;
  anomalies: Array<{ hour: number; count: number; expected: number; note: string }>;
  trend: { current: number; previous: number; deltaPct: number };
};

export type HomeySensorSettings = {
  dayStart: string; // "HH:MM"
  dayEnd: string;
};

export type HomeySensorSummarySettings = {
  enabled: boolean;
  recipient: string;
  hour: number;
  minute: number;
  last_sent_date: string | null;
};

const RANGE = z.enum(["today", "yesterday", "week", "last7"]);

function computeRange(range: SensorRange): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (range === "today") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (range === "yesterday") {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else if (range === "week") {
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  }
  const spanMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - spanMs);
  return { start, end, prevStart, prevEnd };
}

function parseHM(s: string): number {
  const [h, m] = s.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}

function kindBucket(kind: string): "motion" | "door" | "lock" | "window" | null {
  if (kind === "motion") return "motion";
  if (kind === "door") return "door";
  if (kind === "lock") return "lock";
  if (kind === "window") return "window";
  return null;
}

export const getHomeySensorSettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeySensorSettings> => {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("value")
      .eq("key", "homey_sensor_dashboard")
      .maybeSingle();
    const v = (data?.value as any) ?? {};
    return {
      dayStart: typeof v.dayStart === "string" ? v.dayStart : "06:00",
      dayEnd: typeof v.dayEnd === "string" ? v.dayEnd : "22:00",
    };
  },
);

export const saveHomeySensorSettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      dayStart: z.string().regex(/^\d{2}:\d{2}$/),
      dayEnd: z.string().regex(/^\d{2}:\d{2}$/),
    }).parse,
  )
  .handler(async ({ data }) => {
    const { data: existing } = await supabaseAdmin
      .from("notification_settings")
      .select("id")
      .eq("key", "homey_sensor_dashboard")
      .maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("notification_settings")
        .update({ value: data as any, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin
        .from("notification_settings")
        .insert({ key: "homey_sensor_dashboard", value: data as any });
    }
    return { ok: true };
  });

export const getHomeySensorDashboard = createServerFn({ method: "GET" })
  .inputValidator(z.object({ range: RANGE.default("today") }).parse)
  .handler(async ({ data }): Promise<HomeySensorDashboard> => {
    const { start, end, prevStart, prevEnd } = computeRange(data.range);

    const settings = await (async () => {
      const { data: s } = await supabaseAdmin
        .from("notification_settings")
        .select("value")
        .eq("key", "homey_sensor_dashboard")
        .maybeSingle();
      const v = (s?.value as any) ?? {};
      return {
        dayStart: typeof v.dayStart === "string" ? v.dayStart : "06:00",
        dayEnd: typeof v.dayEnd === "string" ? v.dayEnd : "22:00",
      };
    })();
    const dayStartMin = parseHM(settings.dayStart);
    const dayEndMin = parseHM(settings.dayEnd);

    const [{ data: rows }, { data: prevRows }, { data: stateRows }] = await Promise.all([
      supabaseAdmin
        .from("homey_sensor_events")
        .select("ts, device_id, device_name, zone, kind, event_type")
        .gte("ts", start.toISOString())
        .lte("ts", end.toISOString())
        .order("ts", { ascending: false })
        .limit(10000),
      supabaseAdmin
        .from("homey_sensor_events")
        .select("ts, kind, event_type")
        .gte("ts", prevStart.toISOString())
        .lte("ts", prevEnd.toISOString())
        .limit(20000),
      supabaseAdmin
        .from("homey_sensor_state")
        .select("device_name, zone, kind, last_ts"),
    ]);

    const events = rows ?? [];

    // Totals
    const totals = {
      motion: 0, door_open: 0, door_close: 0, window_open: 0, window_close: 0,
      locked: 0, unlocked: 0, all: events.length,
    };
    for (const e of events) {
      if (e.event_type === "motion_on") totals.motion++;
      else if (e.event_type === "door_open") totals.door_open++;
      else if (e.event_type === "door_close") totals.door_close++;
      else if (e.event_type === "window_open") totals.window_open++;
      else if (e.event_type === "window_close") totals.window_close++;
      else if (e.event_type === "locked") totals.locked++;
      else if (e.event_type === "unlocked") totals.unlocked++;
    }

    // Hourly buckets (24 hours of day)
    const hourly = Array.from({ length: 24 }, (_, h) => ({
      hour: h, motion: 0, door: 0, lock: 0, window: 0,
    }));
    let dayCount = 0, nightCount = 0;
    for (const e of events) {
      const d = new Date(e.ts);
      const h = d.getHours();
      const b = kindBucket(e.kind);
      if (b && hourly[h]) hourly[h][b]++;
      // day/night
      const min = h * 60 + d.getMinutes();
      const isDay = dayStartMin <= dayEndMin
        ? min >= dayStartMin && min < dayEndMin
        : min >= dayStartMin || min < dayEndMin;
      if (isDay) dayCount++;
      else nightCount++;
    }

    // Daily buckets (for week/last7)
    const daysSpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
    const daily: HomeySensorDashboard["daily"] = [];
    for (let i = 0; i < daysSpan; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      daily.push({
        label: d.toLocaleDateString("nb-NO", { weekday: "short", day: "numeric" }),
        date: d.toISOString().slice(0, 10),
        motion: 0, door: 0, lock: 0, window: 0,
      });
    }
    for (const e of events) {
      const d = new Date(e.ts);
      const idx = Math.floor((d.getTime() - start.getTime()) / 86400000);
      const b = kindBucket(e.kind);
      if (b && daily[idx]) daily[idx][b]++;
    }

    // By room
    const roomMap = new Map<string, HomeySensorDashboard["byRoom"][number]>();
    for (const e of events) {
      const zone = e.zone || "Ukjent";
      let r = roomMap.get(zone);
      if (!r) {
        r = { zone, motion: 0, door: 0, lock: 0, window: 0, total: 0 };
        roomMap.set(zone, r);
      }
      const b = kindBucket(e.kind);
      if (b) r[b]++;
      r.total++;
    }
    const byRoom = Array.from(roomMap.values()).sort((a, b) => b.total - a.total);
    const topRoom = byRoom[0] ? { zone: byRoom[0].zone, count: byRoom[0].total } : null;
    const topRooms = byRoom.slice(0, 5).map((r) => ({ zone: r.zone, count: r.total }));

    // Last motion
    const lastMotionEv = events.find((e) => e.event_type === "motion_on");
    const lastMotion = lastMotionEv
      ? { ts: lastMotionEv.ts, device: lastMotionEv.device_name || "Ukjent", zone: lastMotionEv.zone }
      : null;

    // Peak hours
    const hourCounts = hourly.map((h) => ({ hour: h.hour, count: h.motion + h.door + h.lock + h.window }));
    const peakHours = [...hourCounts].sort((a, b) => b.count - a.count).slice(0, 3).filter((h) => h.count > 0);

    // Inactive sensors (no event > 7 days)
    const cutoff = Date.now() - 7 * 86400000;
    const inactiveSensors = (stateRows ?? [])
      .filter((r) => r.last_ts && new Date(r.last_ts).getTime() < cutoff)
      .map((r) => ({
        device_name: r.device_name || "Ukjent",
        zone: r.zone,
        kind: r.kind,
        last_ts: r.last_ts,
      }))
      .sort((a, b) => a.last_ts.localeCompare(b.last_ts))
      .slice(0, 10);

    // Motion sensors with no motion in 7 days (uses last event of type motion_on)
    const motionStates = (stateRows ?? []).filter((r) => r.kind === "motion");
    // For motion we want last *transition to true*. Use homey_sensor_events most recent motion_on per device.
    const { data: lastMotionRows } = await supabaseAdmin
      .from("homey_sensor_events")
      .select("device_id, device_name, zone, ts")
      .eq("event_type", "motion_on")
      .gte("ts", new Date(Date.now() - 60 * 86400000).toISOString())
      .order("ts", { ascending: false })
      .limit(2000);
    const lastMotionByDevice = new Map<string, string>();
    for (const r of lastMotionRows ?? []) {
      if (!lastMotionByDevice.has(r.device_id)) lastMotionByDevice.set(r.device_id, r.ts);
    }
    const allMotionDevices = await supabaseAdmin
      .from("homey_sensor_state")
      .select("device_id, device_name, zone")
      .eq("kind", "motion");
    const inactiveMotion = (allMotionDevices.data ?? [])
      .map((d) => {
        const lastTs = lastMotionByDevice.get(d.device_id) ?? null;
        const ts = lastTs ?? motionStates.find((s) => s.device_id === d.device_id)?.last_ts ?? null;
        const days = ts ? Math.floor((Date.now() - new Date(ts).getTime()) / 86400000) : 999;
        return { device_name: d.device_name || "Ukjent", zone: d.zone, last_ts: ts ?? "", days };
      })
      .filter((d) => d.days >= 7)
      .sort((a, b) => b.days - a.days)
      .slice(0, 10);

    // Anomalies: detect hours where count > 2x avg of non-zero hours
    const nonZero = hourCounts.filter((h) => h.count > 0);
    const avg = nonZero.length > 0 ? nonZero.reduce((s, h) => s + h.count, 0) / nonZero.length : 0;
    const anomalies = hourCounts
      .filter((h) => avg > 0 && h.count >= Math.max(3, avg * 2.2))
      .slice(0, 5)
      .map((h) => ({
        hour: h.hour,
        count: h.count,
        expected: Math.round(avg),
        note: `Uvanlig høy aktivitet kl ${String(h.hour).padStart(2, "0")} (${h.count} vs snitt ${avg.toFixed(1)})`,
      }));

    // Trend vs previous period
    const prevCount = (prevRows ?? []).length;
    const currentCount = events.length;
    const deltaPct = prevCount === 0 ? (currentCount > 0 ? 100 : 0) : Math.round(((currentCount - prevCount) / prevCount) * 100);

    return {
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      totals,
      topRoom,
      lastMotion,
      hourly,
      daily,
      byRoom,
      dayNight: { day: dayCount, night: nightCount },
      peakHours,
      inactiveSensors,
      anomalies,
      trend: { current: currentCount, previous: prevCount, deltaPct },
    };
  });

// ============================================================
// Daily sensor summary push settings
// ============================================================

export const getHomeySensorSummarySettings = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeySensorSummarySettings> => {
    return loadSummaryConfig();
  },
);

export const saveHomeySensorSummarySettings = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      enabled: z.boolean().optional(),
      recipient: z.string().min(1).max(64).optional(),
      hour: z.number().int().min(0).max(23).optional(),
      minute: z.number().int().min(0).max(59).optional(),
    }).parse,
  )
  .handler(async ({ data }) => {
    return saveSummaryConfig(data);
  });

export const sendHomeySensorSummaryTestPush = createServerFn({ method: "POST" }).handler(
  async () => {
    return sendHomeySensorSummaryTest();
  },
);
