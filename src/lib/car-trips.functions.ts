// Kjørelogg for husets Jaguar — import, uthenting og sletting av turer.
import { createServerFn, createIsomorphicFn } from "@tanstack/react-start";
import { z } from "zod";

const __loadAdmin = createIsomorphicFn()
  .server((): Promise<typeof import("@/integrations/supabase/client.server")> =>
    import("@/integrations/supabase/client.server"),
  )
  .client(
    (): Promise<typeof import("@/integrations/supabase/client.server")> =>
      Promise.resolve({ supabaseAdmin: null } as unknown as typeof import("@/integrations/supabase/client.server")),
  );
const { supabaseAdmin } = await __loadAdmin();

const __loadAuth = createIsomorphicFn()
  .server((): Promise<typeof import("@/lib/house-auth.server")> => import("@/lib/house-auth.server"))
  .client(
    (): Promise<typeof import("@/lib/house-auth.server")> =>
      Promise.resolve({
        requireHouseAuth: async () => {},
        isHouseAuthenticated: async () => false,
      } as unknown as typeof import("@/lib/house-auth.server")),
  );
const { requireHouseAuth } = await __loadAuth();

export type CarTrip = {
  id: string;
  vehicle: string;
  start_ts: string;
  end_ts: string | null;
  start_place: string | null;
  start_lat: number | null;
  start_lon: number | null;
  end_place: string | null;
  end_lat: number | null;
  end_lon: number | null;
  duration_min: number | null;
  distance_km: number;
  avg_speed_kmh: number | null;
  energy_regen_kwh: number | null;
  efficiency_kwh_100km: number | null;
};

const TRIP_SELECT =
  "id,vehicle,start_ts,end_ts,start_place,start_lat,start_lon,end_place,end_lat,end_lon,duration_min,distance_km,avg_speed_kmh,energy_regen_kwh,efficiency_kwh_100km";

export const listCarTrips = createServerFn({ method: "GET" }).handler(async (): Promise<CarTrip[]> => {
  await requireHouseAuth();
  const { data, error } = await supabaseAdmin!
    .from("car_trips")
    .select(TRIP_SELECT)
    .order("start_ts", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as CarTrip[];
});

const tripSchema = z.object({
  start_ts: z.string(),
  end_ts: z.string().nullable().optional(),
  start_place: z.string().nullable().optional(),
  start_lat: z.number().nullable().optional(),
  start_lon: z.number().nullable().optional(),
  end_place: z.string().nullable().optional(),
  end_lat: z.number().nullable().optional(),
  end_lon: z.number().nullable().optional(),
  duration_min: z.number().nullable().optional(),
  distance_km: z.number(),
  avg_speed_kmh: z.number().nullable().optional(),
  energy_regen_kwh: z.number().nullable().optional(),
  efficiency_kwh_100km: z.number().nullable().optional(),
});

export const importCarTrips = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ trips: z.array(tripSchema).max(5000) }).parse(d))
  .handler(async ({ data }): Promise<{ imported: number; total: number }> => {
    await requireHouseAuth();
    const rows = data.trips.map((t) => ({ ...t, vehicle: "jaguar" }));
    if (rows.length === 0) return { imported: 0, total: 0 };

    const { data: inserted, error } = await supabaseAdmin!
      .from("car_trips")
      .upsert(rows, { onConflict: "vehicle,start_ts,distance_km", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);

    const { count } = await supabaseAdmin!
      .from("car_trips")
      .select("id", { count: "exact", head: true });

    return { imported: inserted?.length ?? 0, total: count ?? 0 };
  });

export const deleteCarTrip = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    await requireHouseAuth();
    const { error } = await supabaseAdmin!.from("car_trips").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearCarTrips = createServerFn({ method: "POST" }).handler(async () => {
  await requireHouseAuth();
  const { error } = await supabaseAdmin!.from("car_trips").delete().eq("vehicle", "jaguar");
  if (error) throw new Error(error.message);
  return { ok: true };
});
