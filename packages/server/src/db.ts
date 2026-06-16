import { Pool } from "pg";
import type { Campaign } from "../../auction/dist/types.js";
import { MICROS_PER_PAISA } from "../../auction/dist/types.js";
import { newId, newSecret } from "./security.js";

// Database sync is no longer used, we use pg pool for Postgres
// every query below is plain portable SQL.
export class Db {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ 
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false }
    });
  }

  async init(): Promise<void> {
    await this.pool.query(SCHEMA);
  }

  // --- advertisers & campaigns -------------------------------------------------
  async createAdvertiser(email: string, name: string, balancePaise: number): Promise<string> {
    const id = newId("adv");
    await this.pool.query(
      `INSERT INTO advertisers(id,email,name,balance_micros) VALUES($1,$2,$3,$4)`,
      [id, email, name, balancePaise * MICROS_PER_PAISA]
    );
    return id;
  }

  async createCampaign(c: Omit<Campaign, "spentToday">): Promise<void> {
    await this.pool.query(
      `INSERT INTO campaigns(id,advertiser_id,ad_line,destination_url,brand_name,brand_icon_url,
         bid_cpm,daily_budget,spent_today_micros,historical_ctr,quality_score,status,target_geo)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12)`,
      [
        c.id, c.advertiserId, c.adLine, c.destinationUrl, c.brandName ?? null, c.brandIconUrl ?? null,
        c.bidCpm, c.dailyBudget, c.historicalCtr, c.qualityScore, c.status,
        c.targetGeo ? JSON.stringify(c.targetGeo) : null,
      ]
    );
  }

  /** All campaigns shaped for the auction engine (spent converted micros→paise). */
  async activeCampaigns(): Promise<Campaign[]> {
    const { rows } = await this.pool.query(`SELECT * FROM campaigns`);
    return rows.map((r: any) => ({
      id: r.id,
      advertiserId: r.advertiser_id,
      adLine: r.ad_line,
      destinationUrl: r.destination_url,
      brandName: r.brand_name ?? undefined,
      brandIconUrl: r.brand_icon_url ?? undefined,
      bidCpm: Number(r.bid_cpm),
      dailyBudget: Number(r.daily_budget),
      spentToday: Math.floor(Number(r.spent_today_micros) / MICROS_PER_PAISA),
      historicalCtr: r.historical_ctr,
      qualityScore: r.quality_score,
      status: r.status,
      targetGeo: r.target_geo ? JSON.parse(r.target_geo) : undefined,
    }));
  }

  // --- developers (the people who get the 60%) --------------------------------
  async registerDevice(deviceId: string): Promise<{ developerId: string; secret: string }> {
    const { rows } = await this.pool.query(`SELECT id, secret FROM developers WHERE device_id=$1`, [deviceId]);
    if (rows.length > 0) return { developerId: rows[0].id, secret: rows[0].secret };
    const id = newId("dev");
    const secret = newSecret();
    await this.pool.query(
      `INSERT INTO developers(id,device_id,secret,earnings_micros,created_at) VALUES($1,$2,$3,0,$4)`,
      [id, deviceId, Date.now()]
    );
    return { developerId: id, secret };
  }

  async deviceSecret(deviceId: string): Promise<string | null> {
    const { rows } = await this.pool.query(`SELECT secret FROM developers WHERE device_id=$1`, [deviceId]);
    return rows.length > 0 ? rows[0].secret : null;
  }

  // --- serve tokens (replay / fraud guard) ------------------------------------
  async recordServe(token: string, campaignId: string, deviceId: string, clearingCpm: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO serves(token,campaign_id,device_id,clearing_cpm,impression_done,click_done)
       VALUES($1,$2,$3,$4,0,0)`,
      [token, campaignId, deviceId, clearingCpm]
    );
  }

  async getServe(token: string): Promise<any> {
    const { rows } = await this.pool.query(`SELECT * FROM serves WHERE token=$1`, [token]);
    return rows.length > 0 ? rows[0] : null;
  }

  async markServe(token: string, field: "impression_done" | "click_done"): Promise<void> {
    await this.pool.query(`UPDATE serves SET ${field}=1 WHERE token=$1`, [token]);
  }

  // --- rate limiting ----------------------------------------------------------
  async countRecentEvents(deviceId: string, sinceTs: number): Promise<number> {
    const { rows } = await this.pool.query(`SELECT COUNT(*) c FROM events WHERE device_id=$1 AND ts>=$2`, [deviceId, sinceTs]);
    return Number(rows[0].c);
  }

  async logEvent(token: string, type: string, deviceId: string, ts: number): Promise<void> {
    await this.pool.query(`INSERT INTO events(serve_token,type,device_id,ts) VALUES($1,$2,$3,$4)`, [token, type, deviceId, ts]);
  }

  // --- the money: accrue gross, split, move balances --------------------------
  async settle(campaignId: string, deviceId: string, grossMicros: number, platformMicros: number, developerMicros: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT advertiser_id FROM campaigns WHERE id=$1`, [campaignId]);
      const advId = rows[0].advertiser_id;
      
      await client.query(`UPDATE campaigns SET spent_today_micros = spent_today_micros + $1 WHERE id=$2`, [grossMicros, campaignId]);
      await client.query(`UPDATE advertisers SET balance_micros = balance_micros + $1 WHERE id=$2`, [-grossMicros, advId]); // PostgreSQL handles negatives easily, or use balance_micros - $1
      await client.query(`UPDATE developers SET earnings_micros = earnings_micros + $1 WHERE device_id=$2`, [developerMicros, deviceId]);
      await client.query(`UPDATE platform SET revenue_micros = revenue_micros + $1 WHERE id=1`, [platformMicros]);
      
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async developerEarnings(deviceId: string): Promise<number> {
    const { rows } = await this.pool.query(`SELECT earnings_micros e FROM developers WHERE device_id=$1`, [deviceId]);
    return rows.length > 0 ? Number(rows[0].e) : 0;
  }
  async platformRevenue(): Promise<number> {
    const { rows } = await this.pool.query(`SELECT revenue_micros r FROM platform WHERE id=1`);
    return rows.length > 0 ? Number(rows[0].r) : 0;
  }
  async advertiserBalance(advId: string): Promise<number> {
    const { rows } = await this.pool.query(`SELECT balance_micros b FROM advertisers WHERE id=$1`, [advId]);
    return rows.length > 0 ? Number(rows[0].b) : 0;
  }

  // --- advertiser self-serve (portal) -----------------------------------------
  async createAdvertiserWithKey(email: string, name: string, balancePaise: number): Promise<{ id: string; apiKey: string }> {
    const id = newId("adv");
    const apiKey = newSecret();
    await this.pool.query(
      `INSERT INTO advertisers(id,email,name,balance_micros,api_key) VALUES($1,$2,$3,$4,$5)`,
      [id, email, name, balancePaise * MICROS_PER_PAISA, apiKey]
    );
    return { id, apiKey };
  }
  async advertiserIdByKey(apiKey: string): Promise<string | null> {
    const { rows } = await this.pool.query(`SELECT id FROM advertisers WHERE api_key=$1`, [apiKey]);
    return rows.length > 0 ? rows[0].id : null;
  }
  async creditAdvertiser(advId: string, paise: number): Promise<void> {
    await this.pool.query(`UPDATE advertisers SET balance_micros = balance_micros + $1 WHERE id=$2`, [paise * MICROS_PER_PAISA, advId]);
  }

  // --- live leaderboard --------------------------------------------------------
  async leaderboard(): Promise<any[]> {
    const { rows } = await this.pool.query(
      `SELECT c.id, c.ad_line, c.brand_name, c.bid_cpm, c.daily_budget, c.spent_today_micros, c.status,
         (SELECT COUNT(*) FROM events e JOIN serves s ON e.serve_token = s.token
            WHERE s.campaign_id = c.id AND e.type = 'impression') AS impressions
       FROM campaigns c WHERE c.status = 'active'
       ORDER BY c.bid_cpm DESC`
    );
    return rows;
  }

  // --- developer dashboard & payouts ------------------------------------------
  async developerByDevice(deviceId: string): Promise<any> {
    const { rows } = await this.pool.query(`SELECT id, device_id, earnings_micros, created_at FROM developers WHERE device_id=$1`, [deviceId]);
    return rows.length > 0 ? rows[0] : null;
  }
  async payoutsFor(deviceId: string): Promise<any[]> {
    const { rows } = await this.pool.query(`SELECT id, amount_micros, status, created_at FROM payouts WHERE device_id=$1 ORDER BY created_at DESC`, [deviceId]);
    return rows;
  }
  /** Move all claimable earnings into a pending payout record. */
  async requestPayout(deviceId: string): Promise<{ ok: boolean; amountMicros: number; payoutId?: string }> {
    const dev = await this.developerByDevice(deviceId);
    if (!dev || Number(dev.earnings_micros) <= 0) return { ok: false, amountMicros: 0 };
    const amount = Number(dev.earnings_micros);
    const id = newId("po");
    
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO payouts(id,device_id,amount_micros,status,created_at) VALUES($1,$2,$3,$4,$5)`, [id, deviceId, amount, "pending", Date.now()]);
      await client.query(`UPDATE developers SET earnings_micros=0 WHERE device_id=$1`, [deviceId]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return { ok: true, amountMicros: amount, payoutId: id };
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS advertisers(
  id TEXT PRIMARY KEY, email TEXT, name TEXT, balance_micros BIGINT NOT NULL DEFAULT 0, api_key TEXT);
CREATE TABLE IF NOT EXISTS campaigns(
  id TEXT PRIMARY KEY, advertiser_id TEXT, ad_line TEXT, destination_url TEXT,
  brand_name TEXT, brand_icon_url TEXT, bid_cpm BIGINT, daily_budget BIGINT,
  spent_today_micros BIGINT NOT NULL DEFAULT 0, historical_ctr REAL, quality_score REAL,
  status TEXT, target_geo TEXT);
CREATE TABLE IF NOT EXISTS developers(
  id TEXT PRIMARY KEY, device_id TEXT UNIQUE, secret TEXT, earnings_micros BIGINT NOT NULL DEFAULT 0, created_at BIGINT);
CREATE TABLE IF NOT EXISTS serves(
  token TEXT PRIMARY KEY, campaign_id TEXT, device_id TEXT, clearing_cpm BIGINT,
  impression_done INT NOT NULL DEFAULT 0, click_done INT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS events(
  id SERIAL PRIMARY KEY, serve_token TEXT, type TEXT, device_id TEXT, ts BIGINT);
CREATE INDEX IF NOT EXISTS idx_events_device_ts ON events(device_id, ts);
CREATE TABLE IF NOT EXISTS platform(id SERIAL PRIMARY KEY, revenue_micros BIGINT NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS payouts(
  id TEXT PRIMARY KEY, device_id TEXT, amount_micros BIGINT, status TEXT, created_at BIGINT);
INSERT INTO platform(id, revenue_micros) VALUES(1, 0) ON CONFLICT DO NOTHING;
`;
