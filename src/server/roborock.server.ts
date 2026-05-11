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
  const r = await fetch(`${base}/api/v3/key/sign?s=${encodeURIComponent(s)}`, {
    method: "POST",
    headers: {
      header_clientid: cid,
      header_clientlang: "en",
      header_appversion: "4.54.02",
      header_phonesystem: "iOS",
      header_phonemodel: "iPhone16,1",
    },
  });
  const j: any = await r.json();
  if (j?.code !== 200 || !j?.data?.k) {
    throw new Error(`sign key feilet: ${j?.msg ?? r.status}`);
  }
  return j.data.k as string;
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

    const cid = headerClientId(email, deviceId);
    const form = new URLSearchParams({ email, type: "login", platform: "" });
    const r = await fetch(`${base}/api/v4/email/code/send`, {
      method: "POST",
      headers: {
        header_clientid: cid,
        "Content-Type": "application/x-www-form-urlencoded",
        header_clientlang: "en",
      },
      body: form.toString(),
    });
    const j: any = await r.json();
    if (j?.code !== 200) {
      return { ok: false, error: `Kunne ikke sende kode: ${j?.msg ?? r.status} (kode ${j?.code})` };
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
    const cid = headerClientId(email, deviceId);

    const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const xBytes = randomBytes(16);
    let xKs = "";
    for (let i = 0; i < 16; i++) xKs += ALPHA[xBytes[i] % ALPHA.length];
    const xK = await signKeyV3(base, email, deviceId, xKs);

    const form = new URLSearchParams({
      country: country ?? "",
      countryCode: countryCode ?? "",
      email,
      code: String(code).trim(),
      majorVersion: "14",
      minorVersion: "0",
    });
    const r = await fetch(`${base}/api/v4/auth/email/login/code`, {
      method: "POST",
      headers: {
        header_clientid: cid,
        "x-mercy-ks": xKs,
        "x-mercy-k": xK,
        "Content-Type": "application/x-www-form-urlencoded",
        header_clientlang: "en",
        header_appversion: "4.54.02",
        header_phonesystem: "iOS",
        header_phonemodel: "iPhone16,1",
      },
      body: form.toString(),
    });
    const j: any = await r.json();
    if (j?.code !== 200 || !j?.data?.token || !j?.data?.rriot) {
      return { ok: false, error: `Login feilet: ${j?.msg ?? r.status} (kode ${j?.code})` };
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
  const j: any = await r.json();
  if (!j?.success || !j?.result) {
    // Prøv v1
    const path2 = `/user/homes/${homeId}`;
    const r2 = await fetch(`${rriot.r.a}${path2}`, {
      headers: { Authorization: hawkAuth(rriot, path2) },
    });
    const j2: any = await r2.json();
    if (!j2?.success || !j2?.result) {
      throw new Error(`getDevices feilet: ${j?.msg ?? j2?.msg ?? "ukjent"}`);
    }
    return mapDevices(j2.result);
  }
  return mapDevices(j.result);
}

function mapDevices(result: any): RoborockDevice[] {
  const products: any[] = result.products ?? [];
  const productById = new Map<string, any>(products.map((p) => [p.id, p]));
  const devices: any[] = [...(result.devices ?? []), ...(result.receivedDevices ?? [])];
  return devices.map((d) => {
    const p = productById.get(d.productId) ?? {};
    return {
      duid: d.duid,
      name: d.name ?? "Roborock",
      online: !!d.online,
      productName: p.name,
      fv: d.fv,
      attribute: d.deviceStatus ?? null,
    };
  });
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
