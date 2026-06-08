import { createHash, createHmac, randomBytes } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE_URLS = [
  "https://usiot.roborock.com",
  "https://euiot.roborock.com",
  "https://cniot.roborock.com",
  "https://ruiot.roborock.com",
];

type RriotRef = { r: string; a: string; m: string; l: string };
type Rriot = { u: string; s: string; h: string; k: string; r: RriotRef };

type AuthRow = {
  email: string;
  device_id: string;
  country: string | null;
  country_code: string | null;
  base_url: string | null;
  token: string | null;
  rriot: Rriot | null;
};

export type RoborockDevice = {
  duid: string;
  name: string;
  online: boolean;
  productName?: string;
  fv?: string;
  attribute?: any;
  localKey?: string;
};

export type RoborockSnapshot = {
  ok: boolean;
  needsLogin?: boolean;
  email?: string;
  homeId?: number | string;
  devices: RoborockDevice[];
  error?: string;
};

function b64(buf: Buffer) {
  return buf.toString("base64");
}

function headerClientId(email: string, deviceId: string) {
  const md5 = createHash("md5");
  md5.update(email);
  md5.update(deviceId);
  return b64(md5.digest());
}

function randToken(bytes = 16) {
  return randomBytes(bytes).toString("base64url");
}

const MERCY_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randMercyKey() {
  const bytes = randomBytes(16);
  return Array.from(bytes, (byte) => MERCY_ALPHABET[byte % MERCY_ALPHABET.length]).join("");
}

function isSignatureError(response: any) {
  return response?.code === 1003 || String(response?.msg ?? "").toLowerCase().includes("signature");
}

async function postForm(base: string, path: string, headers: Record<string, string>, form: URLSearchParams) {
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  return { response: r, json: await r.json() as any };
}

async function loadAuth(): Promise<AuthRow | null> {
  const { data } = await supabaseAdmin
    .from("roborock_auth" as any)
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return (data as AuthRow | null) ?? null;
}

async function saveAuth(patch: Partial<AuthRow> & { email: string; device_id: string }) {
  await supabaseAdmin.from("roborock_auth" as any).upsert({
    id: 1,
    ...patch,
    updated_at: new Date().toISOString(),
  });
}

async function discoverBase(email: string, deviceId: string): Promise<{ base: string; country: string | null; countryCode: string | null }> {
  const cid = headerClientId(email, deviceId);
  let lastMsg = "ingen respons";
  for (const base of BASE_URLS) {
    try {
      const url = `${base}/api/v1/getUrlByEmail?email=${encodeURIComponent(email)}&needtwostepauth=false`;
      const r = await fetch(url, { method: "POST", headers: { header_clientid: cid } });
      const j: any = await r.json();
      if (j?.code === 200 && j?.data?.url) {
        return {
          base: j.data.url as string,
          country: j.data.country ?? null,
          countryCode: j.data.countrycode ?? null,
        };
      }
      lastMsg = `${base}: code=${j?.code} msg=${j?.msg}`;
    } catch (e: any) {
      lastMsg = `${base}: ${e?.message ?? e}`;
    }
  }
  throw new Error(`getUrlByEmail feilet på alle servere (${lastMsg})`);
}

async function signKeyV3(base: string, email: string, deviceId: string, s: string): Promise<string> {
  const cid = headerClientId(email, deviceId);
  // Match python-roborock: only header_clientid, no extra headers, POST with s as query param.
  const r = await fetch(`${base}/api/v3/key/sign?s=${encodeURIComponent(s)}`, {
    method: "POST",
    headers: { header_clientid: cid },
  });
  const j: any = await r.json();
  if (j?.code !== 200 || !j?.data?.k) {
    throw new Error(`sign key feilet: ${j?.msg ?? r.status}`);
  }
  return j.data.k as string;
}

async function codeLoginV4(base: string, email: string, deviceId: string, code: string, country: string | null, countryCode: string | null) {
  const cid = headerClientId(email, deviceId);
  const xMercyKs = randMercyKey();
  const xMercyK = await signKeyV3(base, email, deviceId, xMercyKs);
  const form = new URLSearchParams({
    country: country ?? "",
    countryCode: countryCode ?? "",
    email,
    code,
    majorVersion: "14",
    minorVersion: "0",
  });
  const { json } = await postForm(base, "/api/v4/auth/email/login/code", {
    header_clientid: cid,
    "x-mercy-ks": xMercyKs,
    "x-mercy-k": xMercyK,
    header_clientlang: "en",
    header_appversion: "4.54.02",
    header_phonesystem: "iOS",
    header_phonemodel: "iPhone16,1",
  }, form);
  return json;
}

async function sendCodeV4(base: string, email: string, deviceId: string) {
  const cid = headerClientId(email, deviceId);
  const form = new URLSearchParams({
    email,
    type: "login",
    platform: "",
  });
  const { json } = await postForm(base, "/api/v4/email/code/send", {
    header_clientid: cid,
    header_clientlang: "en",
  }, form);
  return json;
}

async function passwordLoginV1(base: string, email: string, deviceId: string, password: string) {
  const cid = headerClientId(email, deviceId);
  const url = `${base}/api/v1/login?username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}&needtwostepauth=false`;
  const r = await fetch(url, { method: "POST", headers: { header_clientid: cid } });
  return (await r.json()) as any;
}

export async function loginWithPassword(): Promise<{ ok: boolean; error?: string }> {
  const email = process.env.ROBOROCK_EMAIL;
  const password = process.env.ROBOROCK_PASSWORD;
  if (!email) return { ok: false, error: "Mangler ROBOROCK_EMAIL" };
  if (!password) return { ok: false, error: "Mangler ROBOROCK_PASSWORD" };
  try {
    const auth = await loadAuth();
    const deviceId = auth?.device_id ?? randToken(16);
    let base = auth?.base_url ?? "";
    let country = auth?.country ?? null;
    let countryCode = auth?.country_code ?? null;
    if (!base) {
      const d = await discoverBase(email, deviceId);
      base = d.base; country = d.country; countryCode = d.countryCode;
    }
    const j = await passwordLoginV1(base, email, deviceId, password);
    if (j?.code !== 200 || !j?.data?.token || !j?.data?.rriot) {
      return { ok: false, error: `Login feilet: ${j?.msg ?? "ukjent feil"} (kode ${j?.code})` };
    }
    await saveAuth({
      email,
      device_id: deviceId,
      base_url: base,
      country,
      country_code: countryCode,
      token: j.data.token,
      rriot: j.data.rriot,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function requestLoginCode(): Promise<{ ok: boolean; error?: string }> {
  const email = process.env.ROBOROCK_EMAIL;
  if (!email) return { ok: false, error: "Mangler ROBOROCK_EMAIL" };
  try {
    let auth = await loadAuth();
    let deviceId = auth?.device_id ?? randToken(16);
    let { base, country, countryCode } = auth?.base_url
      ? { base: auth.base_url, country: auth.country, countryCode: auth.country_code }
      : await discoverBase(email, deviceId);

    if (!auth?.base_url) {
      await saveAuth({ email, device_id: deviceId, base_url: base, country, country_code: countryCode });
    }

    const j: any = await sendCodeV4(base, email, deviceId);
    if (j?.code !== 200) {
      return { ok: false, error: `Kunne ikke sende kode: ${j?.msg ?? "ukjent feil"} (kode ${j?.code})` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

export async function verifyLoginCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const email = process.env.ROBOROCK_EMAIL;
  if (!email) return { ok: false, error: "Mangler ROBOROCK_EMAIL" };
  try {
    const auth = await loadAuth();
    if (!auth?.device_id || !auth?.base_url) {
      return { ok: false, error: "Mangler økt — be om kode først." };
    }
    const { device_id: deviceId, base_url: base, country, country_code: countryCode } = auth;

    const j: any = await codeLoginV4(base, email, deviceId, String(code).trim(), country, countryCode);
    if (j?.code !== 200 || !j?.data?.token || !j?.data?.rriot) {
      return { ok: false, error: `Login feilet: ${j?.msg ?? "ukjent feil"} (kode ${j?.code})` };
    }
    await saveAuth({
      email,
      device_id: deviceId,
      base_url: base,
      country,
      country_code: countryCode,
      token: j.data.token,
      rriot: j.data.rriot,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}

function md5Hex(s: string) {
  return createHash("md5").update(s).digest("hex");
}

function hawkAuth(rriot: Rriot, urlPath: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(8).toString("base64url").slice(0, 8);
  const prestr = [
    rriot.u,
    rriot.s,
    nonce,
    String(ts),
    md5Hex(urlPath),
    "",
    "",
  ].join(":");
  const mac = createHmac("sha256", rriot.h).update(prestr).digest("base64");
  return `Hawk id="${rriot.u}",s="${rriot.s}",ts="${ts}",nonce="${nonce}",mac="${mac}"`;
}

async function getHomeId(base: string, email: string, deviceId: string, token: string): Promise<number | string> {
  const cid = headerClientId(email, deviceId);
  const r = await fetch(`${base}/api/v1/getHomeDetail`, {
    headers: { header_clientid: cid, Authorization: token },
  });
  const j: any = await r.json();
  if (j?.code !== 200 || j?.data?.rrHomeId == null) {
    throw new Error(`getHomeDetail feilet: ${j?.msg ?? r.status}`);
  }
  return j.data.rrHomeId;
}

async function getDevices(rriot: Rriot, homeId: number | string): Promise<RoborockDevice[]> {
  const path = `/v3/user/homes/${homeId}`;
  const r = await fetch(`${rriot.r.a}${path}`, {
    headers: { Authorization: hawkAuth(rriot, path) },
  });
  const text = await r.text();
  let j: any = null;
  try { j = JSON.parse(text); } catch { /* ignore */ }
  if (j?.success && j?.result) return mapDevices(j.result);

  // Prøv v1
  const path2 = `/user/homes/${homeId}`;
  const r2 = await fetch(`${rriot.r.a}${path2}`, {
    headers: { Authorization: hawkAuth(rriot, path2) },
  });
  const text2 = await r2.text();
  let j2: any = null;
  try { j2 = JSON.parse(text2); } catch { /* ignore */ }
  if (j2?.success && j2?.result) return mapDevices(j2.result);

  const detail =
    j?.msg ?? j2?.msg ??
    `v3 status=${r.status} body=${text.slice(0, 200)} | v1 status=${r2.status} body=${text2.slice(0, 200)}`;
  throw new Error(`getDevices feilet: ${detail}`);
}


// Roborock returns deviceStatus either as numeric keys (121, 122, ...) or
// as named keys (state, battery, ...). Sometimes only one of the two formats
// is present per device. Normalize so both representations are always set.
const STATUS_NUMERIC_TO_NAMED: Record<string, string> = {
  "120": "error_code",
  "121": "state",
  "122": "battery",
  "123": "fan_power",
  "124": "water_box_mode",
  "125": "main_brush_life",
  "126": "side_brush_life",
  "127": "filter_life",
  "128": "additional_props",
  "133": "charge_status",
  "134": "drying_status",
  "135": "offline_status",
};
const STATUS_NAMED_TO_NUMERIC: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_NUMERIC_TO_NAMED).map(([n, name]) => [name, n]),
);

function normalizeDeviceStatus(raw: any): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return raw ?? null;
  const out: Record<string, unknown> = { ...raw };
  for (const [num, name] of Object.entries(STATUS_NUMERIC_TO_NAMED)) {
    if (out[num] !== undefined && out[name] === undefined) out[name] = out[num];
  }
  for (const [name, num] of Object.entries(STATUS_NAMED_TO_NUMERIC)) {
    if (out[name] !== undefined && out[num] === undefined) out[num] = out[name];
  }
  return out;
}

function mapDevices(result: any): RoborockDevice[] {
  const products: any[] = result.products ?? [];
  const productById = new Map<string, any>(products.map((p) => [p.id, p]));
  const rawDevices: any[] = [...(result.devices ?? []), ...(result.receivedDevices ?? [])];
  const mapped: RoborockDevice[] = [];
  const skipped: Array<{ index: number; reason: string; sample: any }> = [];

  rawDevices.forEach((d, i) => {
    if (!d || typeof d !== "object") {
      skipped.push({ index: i, reason: "device entry not an object", sample: d });
      return;
    }
    if (!d.duid) {
      skipped.push({ index: i, reason: "missing duid", sample: { name: d.name, keys: Object.keys(d) } });
      return;
    }
    const p = productById.get(d.productId) ?? {};
    const attribute = normalizeDeviceStatus(d.deviceStatus);
    mapped.push({
      duid: d.duid,
      name: d.name ?? "Roborock",
      online: !!d.online,
      productName: p.name,
      fv: d.fv,
      attribute,
      localKey: d.localKey ?? d.localkey ?? undefined,
    });
  });

  console.log(
    `[roborock] mapDevices: kept=${mapped.length} skipped=${skipped.length} ` +
      `raw=${rawDevices.length} (devices=${result.devices?.length ?? 0}, received=${result.receivedDevices?.length ?? 0})`,
  );
  mapped.forEach((d) => {
    const keys = d.attribute ? Object.keys(d.attribute).sort().join(",") : "(none)";
    console.log(
      `[roborock] device duid=${d.duid} name=${JSON.stringify(d.name)} online=${d.online} hasLocalKey=${!!d.localKey} statusKeys=[${keys}]`,
    );
  });
  if (skipped.length) {
    console.warn(`[roborock] skipped devices:`, JSON.stringify(skipped));
  }
  return mapped;
}

export async function fetchRoborockSnapshot(): Promise<RoborockSnapshot> {
  const email = process.env.ROBOROCK_EMAIL;
  if (!email) return { ok: false, devices: [], error: "Mangler ROBOROCK_EMAIL" };
  try {
    const auth = await loadAuth();
    if (!auth?.token || !auth?.rriot || !auth?.base_url || !auth?.device_id) {
      return { ok: false, needsLogin: true, devices: [], error: "Ikke innlogget. Send kode på e-post for å logge inn." };
    }
    const homeId = await getHomeId(auth.base_url, email, auth.device_id, auth.token);
    const devices = await getDevices(auth.rriot, homeId);
    return { ok: true, email, homeId, devices };
  } catch (e: any) {
    return { ok: false, devices: [], error: e?.message ?? String(e) };
  }
}

import { sendRoborockMqttCommand } from "@/lib/roborock-mqtt.server";

export type RoborockCommandResult = {
  ok: boolean;
  acked?: boolean;
  result?: any;
  error?: string;
};

export async function sendDeviceCommand(input: {
  duid: string;
  method: string;
  params?: any[];
  waitMs?: number;
}): Promise<RoborockCommandResult> {
  const email = process.env.ROBOROCK_EMAIL;
  if (!email) return { ok: false, error: "Mangler ROBOROCK_EMAIL" };
  try {
    const auth = await loadAuth();
    if (!auth?.rriot || !auth?.token || !auth?.base_url || !auth?.device_id) {
      return { ok: false, error: "Ikke innlogget mot Roborock" };
    }
    // Refetch devices to get a fresh localKey for the requested duid
    const homeId = await getHomeId(auth.base_url, email, auth.device_id, auth.token);
    const devices = await getDevices(auth.rriot, homeId);
    const dev = devices.find((d) => d.duid === input.duid);
    if (!dev) return { ok: false, error: `Fant ikke enhet ${input.duid}` };
    if (!dev.localKey) return { ok: false, error: "Mangler localKey for enheten" };

    return await sendRoborockMqttCommand({
      rriot: auth.rriot,
      duid: input.duid,
      localKey: dev.localKey,
      method: input.method,
      params: input.params ?? [],
      waitMs: input.waitMs ?? 4000,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) };
  }
}
