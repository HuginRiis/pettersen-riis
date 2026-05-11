import { createHash, createHmac, randomBytes } from "crypto";

const DISCOVERY = "https://euiot.roborock.com";

type RriotRef = { r: string; a: string; m: string; l: string };
type Rriot = { u: string; s: string; h: string; k: string; r: RriotRef };
type LoginData = { token: string; uid: number | string; rriot: Rriot };

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
  email?: string;
  homeId?: number | string;
  devices: RoborockDevice[];
  error?: string;
};

function clientId(email: string): string {
  const md5 = createHash("md5");
  md5.update(email);
  md5.update("should_be_unique");
  return md5.digest("base64");
}

async function discoverBase(email: string, cid: string): Promise<string> {
  const r = await fetch(
    `${DISCOVERY}/api/v1/getUrlByEmail?email=${encodeURIComponent(email)}`,
    { headers: { header_clientid: cid } },
  );
  const j: any = await r.json();
  if (j?.code !== 200 || !j?.data?.url) {
    throw new Error(`getUrlByEmail feilet: ${j?.msg ?? r.status}`);
  }
  return j.data.url as string;
}

async function passwordLogin(
  base: string,
  email: string,
  password: string,
  cid: string,
): Promise<LoginData> {
  const form = new URLSearchParams({
    username: email,
    password,
    needtwostepauth: "false",
  });
  const r = await fetch(`${base}/api/v1/login`, {
    method: "POST",
    headers: {
      header_clientid: cid,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const j: any = await r.json();
  if (j?.code !== 200 || !j?.data?.token) {
    throw new Error(`login feilet (${j?.code}): ${j?.msg ?? "ukjent"}`);
  }
  return j.data as LoginData;
}

async function getHomeId(base: string, token: string, cid: string): Promise<number | string> {
  const r = await fetch(`${base}/api/v1/getHomeDetail`, {
    headers: { header_clientid: cid, Authorization: token },
  });
  const j: any = await r.json();
  if (j?.code !== 200 || j?.data?.rrHomeId == null) {
    throw new Error(`getHomeDetail feilet: ${j?.msg ?? r.status}`);
  }
  return j.data.rrHomeId;
}

function rriotAuthHeader(rriot: Rriot, urlPath: string, method: string): string {
  const ts = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(3).toString("hex").toUpperCase().slice(0, 6);
  const prestr = `${rriot.u},${rriot.s},${nonce},${ts},${urlPath},,`;
  const mac = createHmac("sha256", rriot.h).update(prestr).digest("base64");
  return `Hawk id="${rriot.u}", s="${rriot.s}", ts="${ts}", nonce="${nonce}", mac="${mac}"`;
}

async function getDevices(rriot: Rriot, homeId: number | string): Promise<RoborockDevice[]> {
  const path = `/user/homes/${homeId}`;
  const url = `${rriot.r.a}${path}`;
  const r = await fetch(url, {
    headers: {
      Authorization: rriotAuthHeader(rriot, path, "GET"),
    },
  });
  const j: any = await r.json();
  if (j?.code !== 200 || !j?.result) {
    throw new Error(`getDevices feilet: ${j?.msg ?? r.status}`);
  }
  const products: any[] = j.result.products ?? [];
  const productById = new Map<string, any>(products.map((p) => [p.id, p]));
  const devices: any[] = j.result.devices ?? [];
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
  const password = process.env.ROBOROCK_PASSWORD;
  if (!email || !password) {
    return { ok: false, devices: [], error: "Mangler ROBOROCK_EMAIL/ROBOROCK_PASSWORD" };
  }
  try {
    const cid = clientId(email);
    const base = await discoverBase(email, cid);
    const login = await passwordLogin(base, email, password, cid);
    const homeId = await getHomeId(base, login.token, cid);
    const devices = await getDevices(login.rriot, homeId);
    return { ok: true, email, homeId, devices };
  } catch (e: any) {
    return { ok: false, devices: [], error: e?.message ?? String(e) };
  }
}
