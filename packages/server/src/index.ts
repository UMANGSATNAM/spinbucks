import { buildApp } from "./app.js";
import { Db } from "./db.js";
import { newSecret } from "./security.js";

const PORT = Number(process.env.PORT ?? 8080);
const SERVER_SECRET = process.env.SERVER_SECRET ?? newSecret();
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:password@localhost:5432/spinads";

const db = new Db(DATABASE_URL);

async function start() {
  await db.init();

  // Seed a couple of demo campaigns on first boot so /serve returns something.
  const activeCampaigns = await db.activeCampaigns();
  if (activeCampaigns.length === 0) {
    const adv = await db.createAdvertiser("demo@advertiser.com", "Demo Co", 100000); // ₹1,00,000
    await db.createCampaign({
      id: "demo-linear", advertiserId: adv, adLine: "Try Linear — issue tracking built for speed",
      destinationUrl: "https://linear.app", brandName: "Linear",
      bidCpm: 131, dailyBudget: 50000, historicalCtr: 0.03, qualityScore: 1, status: "active",
    });
    await db.createCampaign({
      id: "demo-ramp", advertiserId: adv, adLine: "Ramp — save time and money",
      destinationUrl: "https://ramp.com", brandName: "Ramp",
      bidCpm: 110, dailyBudget: 50000, historicalCtr: 0.02, qualityScore: 1, status: "active",
    });
  }

  const app = buildApp({ db, serverSecret: SERVER_SECRET });
  app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
    console.log(`spinads server on :${PORT}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
