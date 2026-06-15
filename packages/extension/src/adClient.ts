import { signDevice } from "./sign";

export interface ServedAd {
  serveToken: string;
  ad: { adLine: string; destinationUrl: string; brandName?: string; brandIconUrl?: string };
}

export async function registerDevice(serverUrl: string, deviceId: string): Promise<{ developerId: string; secret: string }> {
  const r = await fetch(`${serverUrl}/v1/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });
  if (!r.ok) throw new Error(`register failed: ${r.status}`);
  return (await r.json()) as { developerId: string; secret: string };
}

export class AdClient {
  constructor(private serverUrl: string, private deviceId: string, private secret: string) {}

  private sig(ts: number) {
    return signDevice(this.secret, this.deviceId, ts);
  }

  /** Ask the server for an ad. Returns null when no ad is available (HTTP 204). */
  async serve(geo?: string): Promise<ServedAd | null> {
    const ts = Date.now();
    const r = await fetch(`${this.serverUrl}/v1/serve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: this.deviceId, ts, sig: this.sig(ts), geo, surface: "panel" }),
    });
    if (r.status === 204) return null;
    if (!r.ok) throw new Error(`serve failed: ${r.status}`);
    return (await r.json()) as ServedAd;
  }

  /** Report a billable event. Returns the developer's share (micros) just earned. */
  async event(serveToken: string, type: "impression" | "click"): Promise<number> {
    const ts = Date.now();
    const r = await fetch(`${this.serverUrl}/v1/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: this.deviceId, ts, sig: this.sig(ts), serveToken, type }),
    });
    if (!r.ok) return 0;
    const body = (await r.json()) as { developerMicros: number };
    return body.developerMicros ?? 0;
  }
}
