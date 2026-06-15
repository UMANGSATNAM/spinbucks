import { join } from "node:path";
import { buildApp } from "./app.js";
import { Db } from "./db.js";
import { newSecret } from "./security.js";

const PORT = Number(process.env.PORT ?? 8080);
const SERVER_SECRET = process.env.SERVER_SECRET ?? newSecret();
// Persist the sqlite file on the Railway volume if one is attached, so data
// survives redeploys. Falls back to DB_PATH, then a local file.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const DB_PATH = process.env.DB_PATH ?? (VOLUME ? join(VOLUME, "spinads.db") : "spinads.db");

const db = new Db(DB_PATH);

// Seed a couple of demo campaigns on first boot so /serve returns something.
if (db.activeCampaigns().length === 0) {
  const adv = db.createAdvertiser("demo@advertiser.com", "Demo Co", 100000); // ₹1,00,000
  db.createCampaign({
    id: "demo-linear", advertiserId: adv, adLine: "Try Linear — issue tracking built for speed",
    destinationUrl: "https://linear.app", brandName: "Linear",
    bidCpm: 131, dailyBudget: 50000, historicalCtr: 0.03, qualityScore: 1, status: "active",
  });
  db.createCampaign({
    id: "demo-ramp", advertiserId: adv, adLine: "Ramp — save time and money",
    destinationUrl: "https://ramp.com", brandName: "Ramp",
    bidCpm: 110, dailyBudget: 50000, historicalCtr: 0.02, qualityScore: 1, status: "active",
  });
}

const app = buildApp({ db, serverSecret: SERVER_SECRET });
app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  console.log(`spinads server on :${PORT}`);
});
