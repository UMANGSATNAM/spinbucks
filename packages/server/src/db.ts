import { DatabaseSync } from "node:sqlite";
import type { Campaign } from "../../auction/dist/types.js";
import { MICROS_PER_PAISA } from "../../auction/dist/types.js";
import { newId, newSecret } from "./security.js";

// node:sqlite ships with Node 22 (run with --experimental-sqlite). For production
// on Railway, swap this class for a Postgres-backed one with the same methods —
// every query below is plain portable SQL.
export class Db {
  private db: DatabaseSync;

  constructor(path = ":memory:") {
    this.db = new DatabaseSync(path);
    this.db.exec(SCHEMA);
  }

  // --- advertisers & campaigns -------------------------------------------------
  createAdvertiser(email: string, name: string, balancePaise: number): string {
    const id = newId("adv");
    this.db
      .prepare(`INSERT INTO advertisers(id,email,name,balance_micros) VALUES(?,?,?,?)`)
      .run(id, email, name, balancePaise * MICROS_PER_PAISA);
    return id;
  }

  createCampaign(c: Omit<Campaign, "spentToday">): void {
    this.db
      .prepare(
        `INSERT INTO campaigns(id,advertiser_id,ad_line,destination_url,brand_name,brand_icon_url,
           bid_cpm,daily_budget,spent_today_micros,historical_ctr,quality_score,status,target_geo)
         VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?)`,
      )
      .run(
        c.id, c.advertiserId, c.adLine, c.destinationUrl, c.brandName ?? null, c.brandIconUrl ?? null,
        c.bidCpm, c.dailyBudget, c.historicalCtr, c.qualityScore, c.status,
        c.targetGeo ? JSON.stringify(c.targetGeo) : null,
      );
  }

  /** All campaigns shaped for the auction engine (spent converted micros→paise). */
  activeCampaigns(): Campaign[] {
    const rows = this.db.prepare(`SELECT * FROM campaigns`).all() as any[];
    return rows.map((r) => ({
      id: r.id,
      advertiserId: r.advertiser_id,
      adLine: r.ad_line,
      destinationUrl: r.destination_url,
      brandName: r.brand_name ?? undefined,
      brandIconUrl: r.brand_icon_url ?? undefined,
      bidCpm: r.bid_cpm,
      dailyBudget: r.daily_budget,
      spentToday: Math.floor(r.spent_today_micros / MICROS_PER_PAISA),
      historicalCtr: r.historical_ctr,
      qualityScore: r.quality_score,
      status: r.status,
      targetGeo: r.target_geo ? JSON.parse(r.target_geo) : undefined,
    }));
  }

  // --- developers (the people who get the 60%) --------------------------------
  registerDevice(deviceId: string): { developerId: string; secret: string } {
    const existing = this.db.prepare(`SELECT id, secret FROM developers WHERE device_id=?`).get(deviceId) as any;
    if (existing) return { developerId: existing.id, secret: existing.secret };
    const id = newId("dev");
    const secret = newSecret();
    this.db
      .prepare(`INSERT INTO developers(id,device_id,secret,earnings_micros,created_at) VALUES(?,?,?,0,?)`)
      .run(id, deviceId, secret, Date.now());
    return { developerId: id, secret };
  }

  deviceSecret(deviceId: string): string | null {
    const r = this.db.prepare(`SELECT secret FROM developers WHERE device_id=?`).get(deviceId) as any;
    return r?.secret ?? null;
  }

  // --- serve tokens (replay / fraud guard) ------------------------------------
  recordServe(token: string, campaignId: string, deviceId: string, clearingCpm: number): void {
    this.db
      .prepare(`INSERT INTO serves(token,campaign_id,device_id,clearing_cpm,impression_done,click_done)
                VALUES(?,?,?,?,0,0)`)
      .run(token, campaignId, deviceId, clearingCpm);
  }

  getServe(token: string): any {
    return this.db.prepare(`SELECT * FROM serves WHERE token=?`).get(token);
  }

  markServe(token: string, field: "impression_done" | "click_done"): void {
    this.db.prepare(`UPDATE serves SET ${field}=1 WHERE token=?`).run(token);
  }

  // --- rate limiting ----------------------------------------------------------
  countRecentEvents(deviceId: string, sinceTs: number): number {
    const r = this.db
      .prepare(`SELECT COUNT(*) c FROM events WHERE device_id=? AND ts>=?`)
      .get(deviceId, sinceTs) as any;
    return r.c;
  }

  logEvent(token: string, type: string, deviceId: string, ts: number): void {
    this.db.prepare(`INSERT INTO events(serve_token,type,device_id,ts) VALUES(?,?,?,?)`).run(token, type, deviceId, ts);
  }

  // --- the money: accrue gross, split, move balances --------------------------
  settle(campaignId: string, deviceId: string, grossMicros: number, platformMicros: number, developerMicros: number): void {
    const advId = (this.db.prepare(`SELECT advertiser_id FROM campaigns WHERE id=?`).get(campaignId) as any).advertiser_id;
    const txn = this.db.prepare(`UPDATE campaigns SET spent_today_micros = spent_today_micros + ? WHERE id=?`);
    txn.run(grossMicros, campaignId);
    this.db.prepare(`UPDATE advertisers SET balance_micros = balance_micros - ? WHERE id=?`).run(grossMicros, advId);
    this.db.prepare(`UPDATE developers SET earnings_micros = earnings_micros + ? WHERE device_id=?`).run(developerMicros, deviceId);
    this.db.prepare(`UPDATE platform SET revenue_micros = revenue_micros + ? WHERE id=1`).run(platformMicros);
  }

  developerEarnings(deviceId: string): number {
    const r = this.db.prepare(`SELECT earnings_micros e FROM developers WHERE device_id=?`).get(deviceId) as any;
    return r?.e ?? 0;
  }
  platformRevenue(): number {
    return (this.db.prepare(`SELECT revenue_micros r FROM platform WHERE id=1`).get() as any).r;
  }
  advertiserBalance(advId: string): number {
    return (this.db.prepare(`SELECT balance_micros b FROM advertisers WHERE id=?`).get(advId) as any).b;
  }

  // --- advertiser self-serve (portal) -----------------------------------------
  createAdvertiserWithKey(email: string, name: string, balancePaise: number): { id: string; apiKey: string } {
    const id = newId("adv");
    const apiKey = newSecret();
    this.db
      .prepare(`INSERT INTO advertisers(id,email,name,balance_micros,api_key) VALUES(?,?,?,?,?)`)
      .run(id, email, name, balancePaise * MICROS_PER_PAISA, apiKey);
    return { id, apiKey };
  }
  advertiserIdByKey(apiKey: string): string | null {
    const r = this.db.prepare(`SELECT id FROM advertisers WHERE api_key=?`).get(apiKey) as any;
    return r?.id ?? null;
  }
  creditAdvertiser(advId: string, paise: number): void {
    this.db.prepare(`UPDATE advertisers SET balance_micros = balance_micros + ? WHERE id=?`).run(paise * MICROS_PER_PAISA, advId);
  }

  // --- live leaderboard --------------------------------------------------------
  leaderboard(): any[] {
    return this.db
      .prepare(
        `SELECT c.id, c.ad_line, c.brand_name, c.bid_cpm, c.daily_budget, c.spent_today_micros, c.status,
           (SELECT COUNT(*) FROM events e JOIN serves s ON e.serve_token = s.token
              WHERE s.campaign_id = c.id AND e.type = 'impression') AS impressions
         FROM campaigns c WHERE c.status = 'active'
         ORDER BY c.bid_cpm DESC`,
      )
      .all() as any[];
  }

  // --- developer dashboard & payouts ------------------------------------------
  developerByDevice(deviceId: string): any {
    return this.db.prepare(`SELECT id, device_id, earnings_micros, created_at FROM developers WHERE device_id=?`).get(deviceId);
  }
  payoutsFor(deviceId: string): any[] {
    return this.db
      .prepare(`SELECT id, amount_micros, status, created_at FROM payouts WHERE device_id=? ORDER BY created_at DESC`)
      .all(deviceId) as any[];
  }
  /** Move all claimable earnings into a pending payout record. */
  requestPayout(deviceId: string): { ok: boolean; amountMicros: number; payoutId?: string } {
    const dev = this.developerByDevice(deviceId);
    if (!dev || dev.earnings_micros <= 0) return { ok: false, amountMicros: 0 };
    const amount = dev.earnings_micros as number;
    const id = newId("po");
    this.db.prepare(`INSERT INTO payouts(id,device_id,amount_micros,status,created_at) VALUES(?,?,?,?,?)`)
      .run(id, deviceId, amount, "pending", Date.now());
    this.db.prepare(`UPDATE developers SET earnings_micros=0 WHERE device_id=?`).run(deviceId);
    return { ok: true, amountMicros: amount, payoutId: id };
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS advertisers(
  id TEXT PRIMARY KEY, email TEXT, name TEXT, balance_micros INTEGER NOT NULL DEFAULT 0, api_key TEXT);
CREATE TABLE IF NOT EXISTS campaigns(
  id TEXT PRIMARY KEY, advertiser_id TEXT, ad_line TEXT, destination_url TEXT,
  brand_name TEXT, brand_icon_url TEXT, bid_cpm INTEGER, daily_budget INTEGER,
  spent_today_micros INTEGER NOT NULL DEFAULT 0, historical_ctr REAL, quality_score REAL,
  status TEXT, target_geo TEXT);
CREATE TABLE IF NOT EXISTS developers(
  id TEXT PRIMARY KEY, device_id TEXT UNIQUE, secret TEXT, earnings_micros INTEGER NOT NULL DEFAULT 0, created_at INTEGER);
CREATE TABLE IF NOT EXISTS serves(
  token TEXT PRIMARY KEY, campaign_id TEXT, device_id TEXT, clearing_cpm INTEGER,
  impression_done INTEGER NOT NULL DEFAULT 0, click_done INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, serve_token TEXT, type TEXT, device_id TEXT, ts INTEGER);
CREATE INDEX IF NOT EXISTS idx_events_device_ts ON events(device_id, ts);
CREATE TABLE IF NOT EXISTS platform(id INTEGER PRIMARY KEY, revenue_micros INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payouts(
  id TEXT PRIMARY KEY, device_id TEXT, amount_micros INTEGER, status TEXT, created_at INTEGER);
INSERT OR IGNORE INTO platform(id, revenue_micros) VALUES(1, 0);
`;
