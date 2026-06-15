import { createHmac } from "crypto";

/** Sign `${deviceId}:${ts}` with this device's secret — matches the server. */
export function signDevice(secret: string, deviceId: string, ts: number): string {
  return createHmac("sha256", secret).update(`${deviceId}:${ts}`).digest("base64url");
}
