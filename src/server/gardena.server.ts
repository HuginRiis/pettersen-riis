import { supabaseAdmin } from "@/integrations/supabase/client.server";

const AUTH_URL = "https://api.authentication.husqvarnagroup.dev/v1/oauth2/token";
const SMART_URL = "https://api.smart.gardena.dev/v2";

type AuthRow = {
  access_token: string | null;
  refresh_token: string | null;
  token_type: string | null;
  expires_at: string | null;
};

export type GardenaDevice = {
  id: string;
  type: string;
  name: string;
  modelType?: string;
  serial?: string;
  battery?: { level: number | null; state: string | null };
  rfLink?: { level: number | null; state: string | null };
  state?: string | null;
  activity?: string | null;
  lastErrorCode?: string | null;
  operatingHours?: number | null;
  // any other service attributes raw
  raw: Record<string, any>;
};

export type GardenaLocation = {
  id: string;
  name: string;
  devices: GardenaDevice[];
};

export type GardenaSnapshot = {
  ok: boolean;
  error?: string;
  locations: GardenaLocation[];
};

async function loadAuth(): Promise<AuthRow | null> {
  const { data } = await supabaseAdmin
    .from("gardena_auth" as any)
    .select("access_token,refresh_token,token_type,expires_at")
    .eq("id", 1)
    .maybeSingle();
  return (data as AuthRow | null) ?? null;
}

async function saveAuth(patch: Partial<AuthRow> & { access_token: string; expires_at: string }) {
  await supabaseAdmin.from("gardena_auth" as any).upsert({
    id: 1,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

async function fetchNewToken(): Promise<{ access_token: string; refresh_token?: string; token_type: string; expires_in: number }> {
  const key = process.env.GARDENA_APP_KEY!;
  const secret = process.env.GARDENA_APP_SECRET!;
  // Husqvarna deprecated password grant; use client_credentials
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: key,
    client_secret: secret,
  });
  const r = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const j: any = await r.json();
  if (!r.ok || !j?.access_token) {
    throw new Error(`Auth feilet: ${j?.error_description ?? j?.message ?? r.status}`);
  }
  return j;
}

async function getAccessToken(): Promise<string> {
  const auth = await loadAuth();
  const now = Date.now();
  if (auth?.access_token && auth.expires_at && new Date(auth.expires_at).getTime() > now + 60_000) {
    return auth.access_token;
  }
  const t = await fetchNewToken();
  const expiresAt = new Date(now + (t.expires_in - 60) * 1000).toISOString();
  await saveAuth({
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? null,
    token_type: t.token_type ?? "Bearer",
    expires_at: expiresAt,
  });
  return t.access_token;
}

async function gardenaGet(path: string): Promise<any> {
  const token = await getAccessToken();
  const r = await fetch(`${SMART_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Api-Key": process.env.GARDENA_APP_KEY!,
      "Authorization-Provider": "husqvarna",
    },
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`GET ${path} feilet: ${j?.message ?? r.status}`);
  return j;
}

function attr<T = any>(attrs: any, key: string): T | null {
  const v = attrs?.[key];
  if (v == null) return null;
  if (typeof v === "object" && "value" in v) return v.value as T;
  return v as T;
}

function buildDevicesFromIncluded(included: any[]): GardenaDevice[] {
  // A "DEVICE" groups multiple service items by relationships.
  // We'll create one entry per DEVICE and fold service attributes into it.
  const devices = included.filter((i) => i.type === "DEVICE");
  const services = included.filter((i) => i.type !== "DEVICE" && i.type !== "LOCATION");
  const byId = new Map(services.map((s) => [s.id, s]));

  const out: GardenaDevice[] = [];
  for (const dev of devices) {
    const serviceRefs: { id: string; type: string }[] =
      dev.relationships?.services?.data ?? [];
    const folded: Record<string, any> = {};
    let name = "Gardena-enhet";
    let modelType: string | undefined;
    let serial: string | undefined;
    let battery = { level: null as number | null, state: null as string | null };
    let rfLink = { level: null as number | null, state: null as string | null };
    let state: string | null = null;
    let activity: string | null = null;
    let lastErrorCode: string | null = null;
    let operatingHours: number | null = null;
    let primaryType = "DEVICE";

    for (const ref of serviceRefs) {
      const svc = byId.get(ref.id);
      if (!svc) continue;
      const a = svc.attributes ?? {};
      folded[svc.type] = a;

      if (svc.type === "COMMON") {
        name = attr<string>(a, "name") ?? name;
        modelType = attr<string>(a, "modelType") ?? modelType;
        serial = attr<string>(a, "serial") ?? serial;
        battery.level = attr<number>(a, "batteryLevel") ?? battery.level;
        battery.state = attr<string>(a, "batteryState") ?? battery.state;
        rfLink.level = attr<number>(a, "rfLinkLevel") ?? rfLink.level;
        rfLink.state = attr<string>(a, "rfLinkState") ?? rfLink.state;
      } else if (svc.type === "MOWER") {
        primaryType = "MOWER";
        state = attr<string>(a, "state") ?? state;
        activity = attr<string>(a, "activity") ?? activity;
        lastErrorCode = attr<string>(a, "lastErrorCode") ?? lastErrorCode;
        operatingHours = attr<number>(a, "operatingHours") ?? operatingHours;
      } else if (svc.type === "VALVE" || svc.type === "VALVE_SET") {
        primaryType = primaryType === "DEVICE" ? svc.type : primaryType;
        state = attr<string>(a, "state") ?? state;
        activity = attr<string>(a, "activity") ?? activity;
        lastErrorCode = attr<string>(a, "lastErrorCode") ?? lastErrorCode;
      } else if (svc.type === "POWER_SOCKET") {
        primaryType = primaryType === "DEVICE" ? "POWER_SOCKET" : primaryType;
        state = attr<string>(a, "state") ?? state;
        activity = attr<string>(a, "activity") ?? activity;
      } else if (svc.type === "SENSOR") {
        // soil moisture, temperature, light
      }
    }

    out.push({
      id: dev.id,
      type: primaryType,
      name,
      modelType,
      serial,
      battery,
      rfLink,
      state,
      activity,
      lastErrorCode,
      operatingHours,
      raw: folded,
    });
  }
  return out;
}

export async function fetchGardenaSnapshot(): Promise<GardenaSnapshot> {
  if (!process.env.GARDENA_APP_KEY || !process.env.GARDENA_APP_SECRET) {
    return { ok: false, locations: [], error: "Mangler GARDENA_APP_KEY/SECRET" };
  }
  try {
    const locResp = await gardenaGet("/locations");
    const locs: any[] = locResp?.data ?? [];
    const out: GardenaLocation[] = [];
    for (const l of locs) {
      const detail = await gardenaGet(`/locations/${l.id}`);
      const included: any[] = detail?.included ?? [];
      const devices = buildDevicesFromIncluded(included);
      out.push({
        id: l.id,
        name: l.attributes?.name ?? "Gardena-sted",
        devices,
      });
    }
    return { ok: true, locations: out };
  } catch (e: any) {
    return { ok: false, locations: [], error: e?.message ?? String(e) };
  }
}
