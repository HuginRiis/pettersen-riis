import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type VakttarnCategory = "person" | "dyr" | "bil" | "pakke" | "ringt_pa" | "annet";

export interface VakttarnEventRow {
  id: string;
  category: VakttarnCategory;
  camera: string | null;
  source: string;
  detected_at: string;
  confidence: number | null;
  snapshot_url: string | null;
  metadata: string | null;
}

export interface VakttarnStats {
  totals: Record<VakttarnCategory, number>;
  buckets: Array<{
    label: string;
    iso: string;
    person: number;
    dyr: number;
    bil: number;
    pakke: number;
    ringt_pa: number;
    annet: number;
  }>;
  recent: VakttarnEventRow[];
  rangeStart: string;
  rangeEnd: string;
  byCamera: Array<{
    camera: string;
    person: number;
    dyr: number;
    bil: number;
    pakke: number;
    ringt_pa: number;
    annet: number;
    total: number;
    lastAt: string | null;
  }>;
  doorbell: {
    todayCount: number;
    totalCount: number;
    lastRingAt: string | null;
  };
}

const RANGE = z.enum(["day", "week", "month"]);

// Collapse near-duplicate events within `windowSec` per category, ACROSS all
// cameras. Eks: ringeklokke teller "person" og soverom-kamera teller "person"
// innen vinduet → telles som 1. Hver kategori (person, dyr, bil, ringt_pa)
// dedupliseres uavhengig. Hvis samme kamera registrerer 2 personer med mer
// enn `windowSec` mellom, telles begge.
function dedupeEvents(events: VakttarnEventRow[], windowSec: number): VakttarnEventRow[] {
  if (windowSec <= 0 || events.length === 0) return events;
  const asc = [...events].sort((a, b) => a.detected_at.localeCompare(b.detected_at));
  const kept: VakttarnEventRow[] = [];
  const lastByCat = new Map<string, number>();
  for (const ev of asc) {
    const t = new Date(ev.detected_at).getTime();
    const last = lastByCat.get(ev.category);
    if (last !== undefined && t - last < windowSec * 1000) continue;
    kept.push(ev);
    lastByCat.set(ev.category, t);
  }
  return kept.sort((a, b) => b.detected_at.localeCompare(a.detected_at));
}

export const fetchVakttarnEvents = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      range: RANGE.default("day"),
      // ISO date (yyyy-mm-dd) representing the anchor date inside the range
      date: z.string().optional(),
      // Dedupe window in seconds (collapse same-category events across cameras)
      dedupeWindowSec: z.number().int().min(0).max(3600).default(120),
    }).parse
  )
  .handler(async ({ data }): Promise<VakttarnStats> => {
    // ---- Oslo timezone helpers ----
    const osloFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Oslo",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });
    const osloParts = (d: Date) => {
      const p: Record<string, string> = {};
      for (const part of osloFmt.formatToParts(d)) {
        if (part.type !== "literal") p[part.type] = part.value;
      }
      const hour = p.hour === "24" ? 0 : parseInt(p.hour);
      return {
        year: parseInt(p.year), month: parseInt(p.month), day: parseInt(p.day),
        hour, minute: parseInt(p.minute), second: parseInt(p.second),
      };
    };
    // UTC instant corresponding to a given Oslo wall-clock time
    const osloToUtc = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0): Date => {
      let utc = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
      for (let i = 0; i < 3; i++) {
        const p = osloParts(utc);
        const desired = Date.UTC(y, mo - 1, d, h, mi, s);
        const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
        const drift = actual - desired;
        if (drift === 0) break;
        utc = new Date(utc.getTime() - drift);
      }
      return utc;
    };
    const osloDayIndex = (d: Date): number => {
      const p = osloParts(d);
      return Date.UTC(p.year, p.month - 1, p.day) / 86400000;
    };

    const anchor = data.date ? new Date(data.date + "T12:00:00Z") : new Date();
    const aP = osloParts(anchor);
    let start: Date;
    let end: Date;

    if (data.range === "day") {
      start = osloToUtc(aP.year, aP.month, aP.day, 0, 0, 0);
      end = new Date(osloToUtc(aP.year, aP.month, aP.day + 1, 0, 0, 0).getTime() - 1);
    } else if (data.range === "week") {
      // ISO week: monday..sunday in Oslo
      const tmp = new Date(Date.UTC(aP.year, aP.month - 1, aP.day));
      const dow = tmp.getUTCDay() || 7; // 1=Mon..7=Sun
      const mondayUtcMs = tmp.getTime() - (dow - 1) * 86400000;
      const m = new Date(mondayUtcMs);
      start = osloToUtc(m.getUTCFullYear(), m.getUTCMonth() + 1, m.getUTCDate(), 0, 0, 0);
      const sun = new Date(mondayUtcMs + 6 * 86400000);
      end = new Date(
        osloToUtc(sun.getUTCFullYear(), sun.getUTCMonth() + 1, sun.getUTCDate() + 1, 0, 0, 0).getTime() - 1
      );
    } else {
      start = osloToUtc(aP.year, aP.month, 1, 0, 0, 0);
      end = new Date(osloToUtc(aP.year, aP.month + 1, 1, 0, 0, 0).getTime() - 1);
    }

    const { data: rows, error } = await supabaseAdmin
      .from("vakttarn_events")
      .select("*")
      .gte("detected_at", start.toISOString())
      .lte("detected_at", end.toISOString())
      .order("detected_at", { ascending: false })
      .limit(2000);

    if (error) {
      console.error("[vakttarn] fetch failed:", error.message);
      return {
        totals: { person: 0, dyr: 0, bil: 0, pakke: 0, ringt_pa: 0, annet: 0 },
        buckets: [],
        recent: [],
        rangeStart: start.toISOString(),
        rangeEnd: end.toISOString(),
        byCamera: [],
        doorbell: { todayCount: 0, totalCount: 0, lastRingAt: null },
      };
    }

    const rawEvents: VakttarnEventRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      category: r.category,
      camera: r.camera,
      source: r.source,
      detected_at: r.detected_at,
      confidence: r.confidence,
      snapshot_url: r.snapshot_url,
      metadata: r.metadata == null ? null : JSON.stringify(r.metadata),
    }));
    const events = dedupeEvents(rawEvents, data.dedupeWindowSec);

    const totals: Record<VakttarnCategory, number> = {
      person: 0, dyr: 0, bil: 0, pakke: 0, ringt_pa: 0, annet: 0,
    };
    for (const ev of events) totals[ev.category] = (totals[ev.category] ?? 0) + 1;

    // Build buckets (all in Europe/Oslo)
    const buckets: VakttarnStats["buckets"] = [];
    const makeEmpty = (label: string, iso: string) => ({
      label, iso, person: 0, dyr: 0, bil: 0, pakke: 0, ringt_pa: 0, annet: 0,
    });

    if (data.range === "day") {
      for (let h = 0; h < 24; h++) {
        const d = osloToUtc(aP.year, aP.month, aP.day, h, 0, 0);
        buckets.push(makeEmpty(String(h).padStart(2, "0"), d.toISOString()));
      }
      for (const ev of events) {
        const h = osloParts(new Date(ev.detected_at)).hour;
        if (buckets[h]) buckets[h][ev.category]++;
      }
    } else if (data.range === "week") {
      const days = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
      const startIdx = osloDayIndex(start);
      for (let i = 0; i < 7; i++) {
        const sp = osloParts(start);
        const d = osloToUtc(sp.year, sp.month, sp.day + i, 0, 0, 0);
        buckets.push(makeEmpty(days[i], d.toISOString()));
      }
      for (const ev of events) {
        const diffDays = osloDayIndex(new Date(ev.detected_at)) - startIdx;
        if (buckets[diffDays]) buckets[diffDays][ev.category]++;
      }
    } else {
      // Month: number of days in Oslo month
      const nextMonthStart = osloToUtc(aP.year, aP.month + 1, 1, 0, 0, 0);
      const lastDay = osloParts(new Date(nextMonthStart.getTime() - 1)).day;
      for (let i = 1; i <= lastDay; i++) {
        const d = osloToUtc(aP.year, aP.month, i, 0, 0, 0);
        buckets.push(makeEmpty(String(i), d.toISOString()));
      }
      for (const ev of events) {
        const day = osloParts(new Date(ev.detected_at)).day;
        if (buckets[day - 1]) buckets[day - 1][ev.category]++;
      }
    }

    // Per-camera aggregation within selected range
    const byCameraMap = new Map<string, VakttarnStats["byCamera"][number]>();
    for (const ev of events) {
      const cam = ev.camera ?? "Ukjent";
      let row = byCameraMap.get(cam);
      if (!row) {
        row = { camera: cam, person: 0, dyr: 0, bil: 0, pakke: 0, ringt_pa: 0, annet: 0, total: 0, lastAt: null };
        byCameraMap.set(cam, row);
      }
      row[ev.category]++;
      row.total++;
      if (!row.lastAt || ev.detected_at > row.lastAt) row.lastAt = ev.detected_at;
    }
    const byCamera = Array.from(byCameraMap.values()).sort((a, b) => b.total - a.total);

    // Doorbell counters: query independently of selected range
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const [{ count: todayCount }, { count: totalCount }, { data: lastRing }] = await Promise.all([
      supabaseAdmin
        .from("vakttarn_events")
        .select("id", { count: "exact", head: true })
        .eq("category", "ringt_pa")
        .gte("detected_at", todayStart.toISOString()),
      supabaseAdmin
        .from("vakttarn_events")
        .select("id", { count: "exact", head: true })
        .eq("category", "ringt_pa"),
      supabaseAdmin
        .from("vakttarn_events")
        .select("detected_at")
        .eq("category", "ringt_pa")
        .order("detected_at", { ascending: false })
        .limit(1),
    ]);

    return {
      totals,
      buckets,
      recent: events.slice(0, 50),
      rangeStart: start.toISOString(),
      rangeEnd: end.toISOString(),
      byCamera,
      doorbell: {
        todayCount: todayCount ?? 0,
        totalCount: totalCount ?? 0,
        lastRingAt: lastRing && lastRing[0] ? lastRing[0].detected_at : null,
      },
    };
  });
