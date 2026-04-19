import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getHomeySnapshot } from "./homey";

const ROOM_SYNC_TTL_MS = 24 * 60 * 60 * 1000; // 24t

/* ---------- types ---------- */

export type RenovationLocation = "borg" | "hytta";

export type HomeyRoom = {
  id: string;
  location: RenovationLocation;
  homey_zone_id: string;
  name: string;
  parent_zone_id: string | null;
  synced_at: string;
};

/* ---------- Homey rooms: get + sync ---------- */

export const getHomeyRooms = createServerFn({ method: "GET" })
  .inputValidator((input: { location: RenovationLocation }) => input)
  .handler(async ({ data }): Promise<{ rooms: HomeyRoom[]; lastSync: string | null }> => {
    const { data: rows, error } = await supabaseAdmin
      .from("homey_rooms")
      .select("*")
      .eq("location", data.location)
      .order("name");
    if (error) return { rooms: [], lastSync: null };
    const rooms = (rows ?? []) as HomeyRoom[];
    const lastSync = rooms.length > 0
      ? rooms.map((r) => r.synced_at).sort().reverse()[0]
      : null;

    // Auto-sync hvis stale eller tom
    const stale = !lastSync || Date.now() - new Date(lastSync).getTime() > ROOM_SYNC_TTL_MS;
    if (stale) {
      try {
        const synced = await syncHomeyRoomsForLocation(data.location);
        if (synced.rooms.length > 0) return synced;
      } catch {
        // ignorer — returner det vi har
      }
    }
    return { rooms, lastSync };
  });

export const syncHomeyRooms = createServerFn({ method: "POST" })
  .inputValidator((input: { location: RenovationLocation }) => input)
  .handler(async ({ data }): Promise<{ rooms: HomeyRoom[]; lastSync: string | null }> => {
    return syncHomeyRoomsForLocation(data.location);
  });

async function syncHomeyRoomsForLocation(
  location: RenovationLocation,
): Promise<{ rooms: HomeyRoom[]; lastSync: string | null }> {
  const snap = await getHomeySnapshot();
  if (!snap.ok) return { rooms: [], lastSync: null };

  // Slett gamle og sett inn ferske for denne lokasjonen
  await supabaseAdmin.from("homey_rooms").delete().eq("location", location);

  const now = new Date().toISOString();
  const rows = snap.zones.map((z) => ({
    location,
    homey_zone_id: z.id,
    name: z.name,
    parent_zone_id: null as string | null,
    synced_at: now,
  }));

  if (rows.length > 0) {
    await supabaseAdmin.from("homey_rooms").insert(rows);
  }

  const { data: fresh } = await supabaseAdmin
    .from("homey_rooms")
    .select("*")
    .eq("location", location)
    .order("name");

  return { rooms: (fresh ?? []) as HomeyRoom[], lastSync: now };
}
