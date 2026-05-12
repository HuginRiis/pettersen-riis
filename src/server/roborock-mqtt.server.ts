// Minimal Roborock cloud MQTT client.
// Opens TLS socket, sends MQTT CONNECT + PUBLISH for one command, then closes.
// Optionally subscribes and waits briefly for the response on rr/m/o/...

import { createCipheriv, createDecipheriv, createHash } from "crypto";

// Runtime-agnostic TLS socket: tries cloudflare:sockets (Workers), falls back
// to node:tls (dev sandbox / Node SSR). Avoids module-level import that would
// crash outside Workers.
type Sock = {
  write: (b: Buffer) => Promise<void>;
  read: () => Promise<{ value?: Uint8Array; done?: boolean }>;
  close: () => Promise<void>;
};

async function openSocket(hostname: string, port: number): Promise<Sock> {
  try {
    // @ts-ignore - cloudflare:sockets is only present in the Worker runtime
    const mod: any = await import(/* @vite-ignore */ "cloudflare:sockets");
    const s: any = mod.connect({ hostname, port }, { secureTransport: "on", allowHalfOpen: false });
    const writer = s.writable.getWriter();
    const reader = s.readable.getReader();
    return {
      write: async (b) => { await writer.write(b); },
      read: () => reader.read(),
      close: async () => {
        try { await writer.close(); } catch {}
        try { await s.close(); } catch {}
      },
    };
  } catch {
    const tls: any = await import("node:tls");
    const sock: any = tls.connect({ host: hostname, port, servername: hostname });
    await new Promise<void>((res, rej) => {
      sock.once("secureConnect", () => res());
      sock.once("error", (e: any) => rej(e));
    });
    const queue: Uint8Array[] = [];
    const waiters: Array<(v: { value?: Uint8Array; done?: boolean }) => void> = [];
    let ended = false;
    sock.on("data", (chunk: Buffer) => {
      const w = waiters.shift();
      if (w) w({ value: new Uint8Array(chunk) });
      else queue.push(new Uint8Array(chunk));
    });
    const finish = () => {
      ended = true;
      while (waiters.length) waiters.shift()!({ done: true });
    };
    sock.on("end", finish);
    sock.on("close", finish);
    sock.on("error", finish);
    return {
      write: (b) => new Promise((res, rej) =>
        sock.write(b, (err: any) => (err ? rej(err) : res())),
      ),
      read: () => {
        if (queue.length) return Promise.resolve({ value: queue.shift()! });
        if (ended) return Promise.resolve({ done: true });
        return new Promise((res) => { waiters.push(res); });
      },
      close: async () => {
        try { sock.end(); } catch {}
        try { sock.destroy(); } catch {}
      },
    };
  }
}

const SALT = "TXdfu$jyZ#TZHsg4";

// ---------- crypto helpers ----------
function md5(s: string | Buffer): Buffer {
  return createHash("md5").update(s).digest();
}
function md5hex(s: string | Buffer): string {
  return createHash("md5").update(s).digest("hex");
}
function encodeTimestamp(ts: number): string {
  const hex = ts.toString(16).padStart(8, "0").slice(-8);
  const order = [5, 6, 3, 7, 1, 2, 0, 4];
  return order.map((i) => hex[i]).join("");
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array, length: number): number {
  let c = 0xffffffff;
  for (let i = 0; i < length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------- Roborock packet ----------
function aesEcbEncrypt(key: Buffer, data: Buffer): Buffer {
  const c = createCipheriv("aes-128-ecb", key, Buffer.alloc(0));
  c.setAutoPadding(true);
  return Buffer.concat([c.update(data), c.final()]);
}
function aesEcbDecrypt(key: Buffer, data: Buffer): Buffer {
  const c = createDecipheriv("aes-128-ecb", key, null);
  c.setAutoPadding(true);
  return Buffer.concat([c.update(data), c.final()]);
}

function buildRoborockPayload(localKey: string, method: string, params: any[], requestId: number): { msg: Buffer; ts: number } {
  const ts = Math.floor(Date.now() / 1000);
  const inner = JSON.stringify({ id: requestId, method, params });
  const payload = Buffer.from(JSON.stringify({ t: ts, dps: { "101": inner } }), "utf-8");

  const key = md5(encodeTimestamp(ts) + localKey + SALT);
  const enc = aesEcbEncrypt(key, payload);

  const protocol = 101;
  const sequence = (Date.now() & 0xffffffff) >>> 0;
  const random = Math.floor(Math.random() * 900000) + 100000;
  const total = 23 + enc.length;
  const msg = Buffer.alloc(total);
  msg[0] = 0x31; msg[1] = 0x2e; msg[2] = 0x30; // "1.0"
  msg.writeUInt32BE(sequence, 3);
  msg.writeUInt32BE(random, 7);
  msg.writeUInt32BE(ts, 11);
  msg.writeUInt16BE(protocol, 15);
  msg.writeUInt16BE(enc.length, 17);
  enc.copy(msg, 19);
  const c = crc32(msg, msg.length - 4);
  msg.writeUInt32BE(c, msg.length - 4);
  return { msg, ts };
}

function tryParseRoborockResponse(buf: Buffer, localKey: string): { id?: number; result?: any; raw?: any } | null {
  if (buf.length < 23) return null;
  if (buf[0] !== 0x31) return null;
  const ts = buf.readUInt32BE(11);
  const protocol = buf.readUInt16BE(15);
  const len = buf.readUInt16BE(17);
  if (buf.length < 19 + len + 4) return null;
  const enc = buf.subarray(19, 19 + len);
  try {
    const key = md5(encodeTimestamp(ts) + localKey + SALT);
    const plain = aesEcbDecrypt(key, enc).toString("utf-8");
    const obj = JSON.parse(plain);
    const dps = obj?.dps ?? {};
    const inner = dps[String(protocol)] ?? dps["102"] ?? dps["101"];
    if (typeof inner === "string") {
      const parsed = JSON.parse(inner);
      return { id: parsed?.id, result: parsed?.result, raw: parsed };
    }
    return { raw: obj };
  } catch {
    return null;
  }
}

// ---------- minimal MQTT 3.1.1 ----------
function encRem(len: number): number[] {
  const out: number[] = [];
  do {
    let b = len & 0x7f;
    len >>>= 7;
    if (len > 0) b |= 0x80;
    out.push(b);
  } while (len > 0);
  return out;
}
function lenStr(s: string): Buffer {
  const b = Buffer.from(s, "utf-8");
  const out = Buffer.alloc(2 + b.length);
  out.writeUInt16BE(b.length, 0);
  b.copy(out, 2);
  return out;
}
function buildConnect(clientId: string, username: string, password: string): Buffer {
  const proto = Buffer.from([0, 4, 0x4d, 0x51, 0x54, 0x54, 4]); // "MQTT" v4
  const flags = Buffer.from([0xc2]); // username + password + clean session
  const keepalive = Buffer.from([0x00, 0x3c]); // 60s
  const variable = Buffer.concat([proto, flags, keepalive]);
  const payload = Buffer.concat([lenStr(clientId), lenStr(username), lenStr(password)]);
  const remaining = variable.length + payload.length;
  return Buffer.concat([Buffer.from([0x10, ...encRem(remaining)]), variable, payload]);
}
function buildSubscribe(packetId: number, topic: string): Buffer {
  const variable = Buffer.from([packetId >> 8, packetId & 0xff]);
  const t = Buffer.from(topic, "utf-8");
  const tBuf = Buffer.concat([Buffer.from([t.length >> 8, t.length & 0xff]), t, Buffer.from([0])]);
  const payload = tBuf;
  const remaining = variable.length + payload.length;
  return Buffer.concat([Buffer.from([0x82, ...encRem(remaining)]), variable, payload]);
}
function buildPublish(topic: string, payload: Buffer): Buffer {
  const t = Buffer.from(topic, "utf-8");
  const variable = Buffer.concat([Buffer.from([t.length >> 8, t.length & 0xff]), t]);
  const remaining = variable.length + payload.length;
  return Buffer.concat([Buffer.from([0x30, ...encRem(remaining)]), variable, payload]);
}
function buildDisconnect(): Buffer {
  return Buffer.from([0xe0, 0x00]);
}

// Streaming MQTT parser — pulls complete packets from a growing buffer.
type MqttPacket = { type: number; flags: number; payload: Buffer };
function parsePackets(buf: Buffer): { packets: MqttPacket[]; rest: Buffer } {
  const packets: MqttPacket[] = [];
  let i = 0;
  while (i < buf.length) {
    if (buf.length - i < 2) break;
    const header = buf[i];
    let mult = 1, len = 0, j = i + 1, b: number;
    do {
      if (j >= buf.length) return { packets, rest: buf.subarray(i) };
      b = buf[j++];
      len += (b & 0x7f) * mult;
      mult *= 128;
      if (mult > 128 * 128 * 128 * 128) return { packets, rest: buf.subarray(i) };
    } while (b & 0x80);
    if (buf.length < j + len) return { packets, rest: buf.subarray(i) };
    const payload = buf.subarray(j, j + len);
    packets.push({ type: header >> 4, flags: header & 0x0f, payload });
    i = j + len;
  }
  return { packets, rest: buf.subarray(i) };
}

// ---------- public command sender ----------
export type Rriot = { u: string; s: string; h: string; k: string; r: { a: string; m: string; l?: string; r?: string } };

export type SendCommandOpts = {
  rriot: Rriot;
  duid: string;
  localKey: string;
  method: string;
  params?: any[];
  waitMs?: number;
};

export type SendCommandResult = {
  ok: boolean;
  result?: any;
  error?: string;
  acked?: boolean;
};

function parseBroker(m: string): { hostname: string; port: number } {
  // e.g. "ssl://mqtt-eu.roborock.com:8883"
  const cleaned = m.replace(/^ssl:\/\//i, "").replace(/^tcp:\/\//i, "");
  const [host, portStr] = cleaned.split(":");
  return { hostname: host, port: portStr ? parseInt(portStr, 10) : 8883 };
}

export async function sendRoborockMqttCommand(opts: SendCommandOpts): Promise<SendCommandResult> {
  const { rriot, duid, localKey, method, params = [], waitMs = 4000 } = opts;
  const { hostname, port } = parseBroker(rriot.r.m);
  const mqttUser = md5hex(rriot.u + ":" + rriot.k).substring(2, 10);
  const mqttPassword = md5hex(rriot.s + ":" + rriot.k).substring(16);
  const clientId = `lovable-${Math.random().toString(36).slice(2, 10)}`;
  const requestId = Math.floor(Math.random() * 9000) + 1000;
  const topicIn = `rr/m/i/${rriot.u}/${mqttUser}/${duid}`;
  const topicOut = `rr/m/o/${rriot.u}/${mqttUser}/${duid}`;

  let sock: Sock | null = null;
  try {
    sock = await openSocket(hostname, port);

    // Send CONNECT
    await sock.write(buildConnect(clientId, mqttUser, mqttPassword));

    let acked = false;
    let subbed = false;
    let result: any = undefined;
    let buf: Buffer = Buffer.alloc(0);
    const deadline = Date.now() + waitMs + 2000;

    const subscribeAndPublish = async () => {
      await sock!.write(buildSubscribe(1, topicOut));
      const { msg } = buildRoborockPayload(localKey, method, params, requestId);
      await sock!.write(buildPublish(topicIn, msg));
    };

    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const readPromise = sock.read();
      const timeout = new Promise<{ done: true }>((resolve) =>
        setTimeout(() => resolve({ done: true }), remaining),
      );
      const r: any = await Promise.race([readPromise, timeout]);
      if (r?.done || !r?.value) break;

      buf = Buffer.concat([buf, Buffer.from(r.value)]) as Buffer;
      const { packets, rest } = parsePackets(buf);
      buf = rest as Buffer;
      for (const p of packets) {
        if (p.type === 2) {
          if (p.payload.length >= 2 && p.payload[1] !== 0) {
            return { ok: false, error: `MQTT CONNACK feilet: rc=${p.payload[1]}` };
          }
          acked = true;
          await subscribeAndPublish();
        } else if (p.type === 9) {
          subbed = true;
        } else if (p.type === 3) {
          if (p.payload.length < 2) continue;
          const tlen = (p.payload[0] << 8) | p.payload[1];
          const body = p.payload.subarray(2 + tlen);
          const parsed = tryParseRoborockResponse(Buffer.from(body), localKey);
          if (parsed && (parsed.id === requestId || parsed.result !== undefined)) {
            result = parsed.result ?? parsed.raw;
            try { await sock.write(buildDisconnect()); } catch {}
            try { await sock.close(); } catch {}
            return { ok: true, acked: true, result };
          }
        }
      }
      if (acked && subbed && result === undefined && Date.now() > deadline - waitMs / 2) {
        // command sent, no response — keep waiting until deadline
      }
    }

    try { await sock.write(buildDisconnect()); } catch {}
    try { await sock.close(); } catch {}
    if (acked) {
      return { ok: true, acked: true, result: undefined };
    }
    return { ok: false, error: "Timeout: ingen CONNACK fra Roborock-broker" };
  } catch (e: any) {
    try { await sock?.close(); } catch {}
    return { ok: false, error: e?.message ?? String(e) };
  }
}
