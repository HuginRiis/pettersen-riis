import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";


const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const MOTION_TO_CATEGORY: Record<string, string> = {
  NTFY_PRESS_DOORBELL: "ringt_pa",
  NTFY_FACE_DETECTION: "person",
  NTFY_KNOWN_FACE_DETECTION: "person",
  NTFY_PET_DETECTED: "dyr",
  NTFY_VEHICLE_DETECTED: "bil",
  NTFY_VEHICLE_DETECTED_FORCE: "bil",
  NTFY_MOTION_DETECTION: "bevegelse",
  // Lowercase variants (Homey typically exposes alarm_motion.* but some integrations use NTFY_*)
  "alarm_motion.person": "person",
  "alarm_motion.face": "person",
  "alarm_motion.pet": "dyr",
  "alarm_motion.vehicle": "bil",
  alarm_motion: "bevegelse",
};

// Priority — if multiple subtypes fire at once, prefer the most specific
const CATEGORY_PRIORITY: Record<string, number> = {
  ringt_pa: 5,
  person: 4,
  dyr: 3,
  bil: 2,
  bevegelse: 1,
};

type LastSeen = { camera: string; capability: string; value: boolean; lastUpdated: number | null };

// Only consider a capability "freshly triggered" if its lastUpdated timestamp
// is within this window (ms). Cron runs every 5 min → 6 min gives small slack.
const FRESH_WINDOW_MS = 6 * 60 * 1000;

export const Route = createFileRoute("/api/public/hooks/eufy-poll")({
  server: {
    handlers: {
      POST: async () => handlePoll(),
      GET: async () => handlePoll(),
    },
  },
});

async function handlePoll(): Promise<Response> {
  try {
    if (!SERVICE_KEY) {
      return Response.json({ ok: false, error: "missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { getValidConnection, getHomeyRawSnapshot } = await import("@/server/homey");
    const conn = await getValidConnection();
    if (!conn) return Response.json({ ok: false, error: "no homey connection" }, { status: 500 });

    const snap = await getHomeyRawSnapshot(conn);
    if (!snap) return Response.json({ ok: false, error: "snapshot failed" }, { status: 500 });

    // 1) Find Eufy cameras + their currently-active motion-like capabilities
    const current: LastSeen[] = [];
    for (const d of snap.devicesRaw ?? []) {
      const blob = `${(d as any).driverUri ?? ""} ${(d as any).driverId ?? ""} ${(d as any).name ?? ""}`.toLowerCase();
      if (!blob.includes("eufy") && !blob.includes("anker")) continue;
      const camera = String((d as any).name ?? "Ukjent");
      const capObj = (d as any).capabilitiesObj ?? (d as any).capabilities_obj ?? {};
      for (const cap of Object.keys(MOTION_TO_CATEGORY)) {
        const entry = capObj?.[cap];
        if (!entry || entry.value === undefined) continue;
        const lu = entry.lastUpdated ?? entry.last_updated ?? null;
        const luMs = lu ? new Date(lu).getTime() : null;
        current.push({
          camera,
          capability: cap,
          value: Boolean(entry.value),
          lastUpdated: luMs,
        });
      }
    }

    const now = Date.now();
    const inserted: Array<{ camera: string; category: string; lastUpdated: string | null }> = [];
    const seenThisRun = new Set<string>();

    // Group: pick highest-priority FRESHLY-TRIGGERED category per camera.
    // A capability counts as a real event only if value === true AND its
    // lastUpdated timestamp is within FRESH_WINDOW_MS (otherwise it's just a
    // stale "last detected face" flag that stays true forever).
    const perCamera = new Map<string, { category: string; lastUpdated: number }>();
    for (const c of current) {
      if (!c.value) continue;
      if (!c.lastUpdated || now - c.lastUpdated > FRESH_WINDOW_MS) continue;
      const cat = MOTION_TO_CATEGORY[c.capability];
      if (!cat) continue;
      const prev = perCamera.get(c.camera);
      if (!prev || (CATEGORY_PRIORITY[cat] ?? 0) > (CATEGORY_PRIORITY[prev.category] ?? 0)) {
        perCamera.set(c.camera, { category: cat, lastUpdated: c.lastUpdated });
      }
    }

    for (const [camera, { category, lastUpdated }] of perCamera.entries()) {
      const key = `${camera}|${category}`;
      if (seenThisRun.has(key)) continue;
      seenThisRun.add(key);

      // Debounce: skip if same camera+category logged within last 4 min
      const since = new Date(Date.now() - 4 * 60_000).toISOString();
      const { data: recent } = await sb
        .from("vakttarn_events")
        .select("id")
        .eq("camera", camera)
        .eq("category", category)
        .gte("detected_at", since)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const detectedAt = new Date(lastUpdated).toISOString();
      const { error } = await sb.from("vakttarn_events").insert({
        category,
        camera,
        source: "eufy-poll",
        detected_at: detectedAt,
        metadata: { via: "homey-polling", lastUpdated: detectedAt },
      });
      if (!error) inserted.push({ camera, category, lastUpdated: detectedAt });
    }

    return Response.json({
      ok: true,
      checked: perCamera.size,
      inserted,
      activeNow: Array.from(perCamera.entries()).map(([camera, category]) => ({ camera, category })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[eufy-poll] failed:", msg);
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }
}
