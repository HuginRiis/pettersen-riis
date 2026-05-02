import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getValidConnection, getHomeyRawSnapshot } from "@/server/homey";

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
        const val = capObj?.[cap]?.value;
        if (val === undefined) continue;
        current.push({ camera, capability: cap, value: Boolean(val) });
      }
    }

    // 2) Get last-known state from a small kv table (we'll use changelog_entries? no — use a dedicated approach via vakttarn_events latest)
    // Strategy: for each camera+capability, look up the latest event in the last 10 min and check if value just transitioned to true.
    // Simpler: only insert when value === true AND there is no event with same camera+category in the last 90s (debounce).
    const inserted: Array<{ camera: string; category: string }> = [];
    const seenThisRun = new Set<string>(); // camera|category

    // Group: pick highest-priority active category per camera
    const perCamera = new Map<string, string>();
    for (const c of current) {
      if (!c.value) continue;
      const cat = MOTION_TO_CATEGORY[c.capability];
      if (!cat) continue;
      const prev = perCamera.get(c.camera);
      if (!prev || (CATEGORY_PRIORITY[cat] ?? 0) > (CATEGORY_PRIORITY[prev] ?? 0)) {
        perCamera.set(c.camera, cat);
      }
    }

    for (const [camera, category] of perCamera.entries()) {
      const key = `${camera}|${category}`;
      if (seenThisRun.has(key)) continue;
      seenThisRun.add(key);

      // Debounce: skip if same camera+category logged within last 90s
      const since = new Date(Date.now() - 90_000).toISOString();
      const { data: recent } = await sb
        .from("vakttarn_events")
        .select("id")
        .eq("camera", camera)
        .eq("category", category)
        .gte("detected_at", since)
        .limit(1);
      if (recent && recent.length > 0) continue;

      const { error } = await sb.from("vakttarn_events").insert({
        category,
        camera,
        source: "eufy-poll",
        metadata: { via: "homey-polling" },
      });
      if (!error) inserted.push({ camera, category });
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
