import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const b64url = (b: Buffer) => b.toString("base64url");

function hmac(key: string, msg: string): string {
  return b64url(createHmac("sha256", key).update(msg).digest());
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Max allowed clock skew between client ts and server (ms). */
export const MAX_SKEW_MS = 5 * 60 * 1000;

/**
 * Device requests are signed with the device's OWN secret (handed out once at
 * registration). The client signs `${deviceId}:${ts}`. This stops a random
 * machine from spoofing serve/event calls for someone else's device.
 */
export function signDevice(deviceSecret: string, deviceId: string, ts: number): string {
  return hmac(deviceSecret, `${deviceId}:${ts}`);
}

export function verifyDevice(
  deviceSecret: string,
  deviceId: string,
  ts: number,
  sig: string,
  now = Date.now(),
): boolean {
  if (Math.abs(now - ts) > MAX_SKEW_MS) return false; // stale / replayed timestamp
  return safeEqual(sig, signDevice(deviceSecret, deviceId, ts));
}

export interface ServePayload {
  c: string; // campaignId
  d: string; // deviceId
  p: number; // clearingCpm (paise) — locked at serve time
  t: number; // issued-at ts
  n: string; // nonce
}

/**
 * A serveToken is signed by the SERVER secret and binds the campaign, device,
 * and price chosen at serve time. The client cannot fabricate impressions for
 * arbitrary campaigns or inflate the price — every billable event must carry a
 * token the server itself issued.
 */
export function issueServeToken(serverSecret: string, p: Omit<ServePayload, "n" | "t">, now = Date.now()): string {
  const payload: ServePayload = { ...p, t: now, n: b64url(randomBytes(9)) };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  return `${body}.${hmac(serverSecret, body)}`;
}

export function verifyServeToken(serverSecret: string, token: string): ServePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEqual(sig, hmac(serverSecret, body))) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString()) as ServePayload;
  } catch {
    return null;
  }
}

export const newSecret = () => b64url(randomBytes(24));
export const newId = (prefix: string) => `${prefix}_${b64url(randomBytes(9))}`;
