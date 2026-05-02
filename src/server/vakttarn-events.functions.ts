import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

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

export const fetchVakttarnEvents = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      range: RANGE.default("day"),
      // ISO date (yyyy-mm-dd) representing the anchor date inside the range
      date: z.string().optional(),
    }).parse
  )
  .handler(async ({ data }): Promise<VakttarnStats> => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const anchor = data.date ? new Date(data.date + "T12:00:00Z") : new Date();
    const start = new Date(anchor);
    const end = new Date(anchor);

    if (data.range === "day") {
      start.setUTCHours(0, 0, 0, 0);
      end.setUTCHours(23, 59, 59, 999);
    } else if (data.range === "week") {
      // ISO week: monday..sunday in local (Europe/Oslo ~ UTC+1/2). Use UTC approx.
      const day = start.getUTCDay() || 7;
      start.setUTCDate(start.getUTCDate() - day + 1);
      start.setUTCHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setUTCDate(end.getUTCDate() + 6);
      end.setUTCHours(23, 59, 59, 999);
    } else {
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      end.setTime(start.getTime());
      end.setUTCMonth(end.getUTCMonth() + 1);
      end.setUTCDate(0);
      end.setUTCHours(23, 59, 59, 999);
    }

    const { data: rows, error } = await supabase
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

    const events: VakttarnEventRow[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      category: r.category,
      camera: r.camera,
      source: r.source,
      detected_at: r.detected_at,
      confidence: r.confidence,
      snapshot_url: r.snapshot_url,
      metadata: r.metadata == null ? null : JSON.stringify(r.metadata),
    }));

    const totals: Record<VakttarnCategory, number> = {
      person: 0, dyr: 0, bil: 0, pakke: 0, ringt_pa: 0, annet: 0,
    };
    for (const ev of events) totals[ev.category] = (totals[ev.category] ?? 0) + 1;

    // Build buckets
    const buckets: VakttarnStats["buckets"] = [];
    const makeEmpty = (label: string, iso: string) => ({
      label, iso, person: 0, dyr: 0, bil: 0, pakke: 0, ringt_pa: 0, annet: 0,
    });

    if (data.range === "day") {
      for (let h = 0; h < 24; h++) {
        const d = new Date(start);
        d.setUTCHours(h, 0, 0, 0);
        buckets.push(makeEmpty(String(h).padStart(2, "0"), d.toISOString()));
      }
      for (const ev of events) {
        const h = new Date(ev.detected_at).getUTCHours();
        if (buckets[h]) buckets[h][ev.category]++;
      }
    } else if (data.range === "week") {
      const days = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setUTCDate(start.getUTCDate() + i);
        buckets.push(makeEmpty(days[i], d.toISOString()));
      }
      for (const ev of events) {
        const evDate = new Date(ev.detected_at);
        const diffDays = Math.floor(
          (Date.UTC(evDate.getUTCFullYear(), evDate.getUTCMonth(), evDate.getUTCDate()) -
            Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())) /
            86400000
        );
        if (buckets[diffDays]) buckets[diffDays][ev.category]++;
      }
    } else {
      const daysInMonth = end.getUTCDate();
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(start);
        d.setUTCDate(i);
        buckets.push(makeEmpty(String(i), d.toISOString()));
      }
      for (const ev of events) {
        const day = new Date(ev.detected_at).getUTCDate();
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
      supabase
        .from("vakttarn_events")
        .select("id", { count: "exact", head: true })
        .eq("category", "ringt_pa")
        .gte("detected_at", todayStart.toISOString()),
      supabase
        .from("vakttarn_events")
        .select("id", { count: "exact", head: true })
        .eq("category", "ringt_pa"),
      supabase
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
