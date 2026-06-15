// Self-contained HTML pages served by the ad server. Plain vanilla JS calling
// the same-origin API. These deploy with the server — no separate frontend build.

const SHELL = (title: string, body: string) => `<!DOCTYPE html><html><head>
<meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; background:#0b0d10; color:#e7e9ec; margin:0; padding:28px; }
  .wrap { max-width: 820px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { opacity:.6; font-size:13px; margin-bottom:24px; }
  .card { background:#14181d; border:1px solid #232a31; border-radius:12px; padding:18px; margin-bottom:18px; }
  .card h2 { font-size:14px; margin:0 0 12px; text-transform:uppercase; letter-spacing:.05em; opacity:.7; }
  label { display:block; font-size:12px; opacity:.7; margin:10px 0 4px; }
  input, select { width:100%; background:#0b0d10; border:1px solid #2a323b; color:#e7e9ec; padding:9px 11px; border-radius:8px; font-size:14px; }
  button { background:#f46c38; color:#0b0d10; border:0; padding:10px 16px; border-radius:8px; font-weight:600; cursor:pointer; margin-top:14px; font-size:14px; }
  button.secondary { background:#232a31; color:#e7e9ec; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th, td { text-align:left; padding:8px 6px; border-bottom:1px solid #1d242b; }
  th { opacity:.5; font-weight:500; }
  .pill { font-size:11px; background:#1f8f4e22; color:#5fd38a; padding:2px 8px; border-radius:99px; }
  .key { font-family:ui-monospace,monospace; font-size:12px; word-break:break-all; background:#0b0d10; padding:8px; border-radius:6px; border:1px solid #2a323b; }
  .msg { font-size:13px; margin-top:10px; min-height:16px; }
  .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
</style></head><body><div class="wrap">${body}</div></body></html>`;

export function advertiserHtml(): string {
  const body = `
  <h1>SpinBucks — Advertisers</h1>
  <div class="sub">Bid on the most-watched spinner on Earth. Highest eCPM serves first.</div>

  <div class="card">
    <h2>1 · Your advertiser account</h2>
    <div class="grid2">
      <div><label>Email</label><input id="email" placeholder="you@brand.com" /></div>
      <div><label>Brand name</label><input id="name" placeholder="Acme" /></div>
    </div>
    <button onclick="createAdv()">Create account & get API key</button>
    <div class="msg" id="advMsg"></div>
    <div id="keyBox" style="display:none"><label>Your API key (saved in this browser)</label><div class="key" id="keyVal"></div></div>
  </div>

  <div class="card">
    <h2>2 · New campaign</h2>
    <label>Ad line (3–60 chars)</label><input id="adLine" maxlength="60" placeholder="Try Acme — the fastest X" />
    <div class="grid2">
      <div><label>Destination URL</label><input id="url" placeholder="https://acme.com" /></div>
      <div><label>Brand shown on leaderboard</label><input id="brand" placeholder="Acme" /></div>
    </div>
    <div class="grid2">
      <div><label>Bid — ₹ per 1,000 impressions</label><input id="cpm" type="number" value="1.50" step="0.01" /></div>
      <div><label>Daily budget — ₹</label><input id="budget" type="number" value="500" /></div>
    </div>
    <button onclick="createCampaign()">Launch campaign</button>
    <div class="msg" id="campMsg"></div>
  </div>

  <div class="card">
    <h2>3 · Add ad credit</h2>
    <div class="grid2">
      <div><label>Amount — ₹</label><input id="topup" type="number" value="1000" /></div>
      <div><label>Method</label><select id="provider"><option value="stripe">Stripe (global cards)</option><option value="razorpay">Razorpay (India / UPI)</option></select></div>
    </div>
    <button onclick="addCredit()">Add credit</button>
    <div class="msg" id="payMsg"></div>
  </div>

  <div class="card">
    <h2>Live leaderboard</h2>
    <table><thead><tr><th>#</th><th>Campaign</th><th>Bid /1k</th><th>Impressions</th><th>Status</th></tr></thead>
    <tbody id="board"><tr><td colspan="5" style="opacity:.5">loading…</td></tr></tbody></table>
  </div>

  <script>
    const API = "";
    const key = () => localStorage.getItem("sb_key");
    if (key()) { document.getElementById("keyBox").style.display="block"; document.getElementById("keyVal").textContent = key(); }

    async function createAdv() {
      const r = await fetch(API + "/v1/advertisers", { method:"POST", headers:{"content-type":"application/json"},
        body: JSON.stringify({ email: email.value, name: name.value }) });
      const d = await r.json();
      localStorage.setItem("sb_key", d.apiKey);
      keyBox.style.display="block"; keyVal.textContent = d.apiKey;
      advMsg.textContent = "Account created. API key saved in this browser.";
    }

    async function createCampaign() {
      if (!key()) { campMsg.textContent = "Create an account first."; return; }
      const r = await fetch(API + "/v1/campaigns", { method:"POST",
        headers:{"content-type":"application/json","x-advertiser-key":key()},
        body: JSON.stringify({ adLine: adLine.value, destinationUrl: url.value, brandName: brand.value,
          bidCpm: Math.round(parseFloat(cpm.value)*100), dailyBudget: Math.round(parseFloat(budget.value)*100) }) });
      campMsg.textContent = r.ok ? "Campaign live!" : "Error: " + (await r.text());
      loadBoard();
    }

    async function addCredit() {
      if (!key()) { payMsg.textContent = "Create an account first."; return; }
      const r = await fetch(API + "/v1/advertiser/topup", { method:"POST",
        headers:{"content-type":"application/json","x-advertiser-key":key()},
        body: JSON.stringify({ amountInr: parseInt(topup.value), provider: provider.value }) });
      const d = await r.json();
      if (d.url) { location.href = d.url; }
      else if (d.orderId) { payMsg.textContent = "Razorpay order " + d.orderId + " created — open Razorpay checkout with this order."; }
      else { payMsg.textContent = "Payments not configured yet (set Stripe/Razorpay keys on the server)."; }
    }

    async function loadBoard() {
      const r = await fetch(API + "/v1/leaderboard");
      const rows = await r.json();
      board.innerHTML = rows.length ? rows.map((c,i) =>
        "<tr><td>"+(i+1)+"</td><td>"+esc(c.brand_name||c.ad_line)+"</td><td>₹"+(c.bid_cpm/100).toFixed(2)+"</td><td>"+c.impressions+"</td><td><span class='pill'>LIVE</span></td></tr>"
      ).join("") : "<tr><td colspan='5' style='opacity:.5'>No campaigns yet</td></tr>";
    }
    function esc(s){ return (s||"").replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c])); }
    loadBoard(); setInterval(loadBoard, 3000);
  </script>`;
  return SHELL("SpinBucks — Advertisers", body);
}

export function developerHtml(): string {
  const body = `
  <h1>SpinBucks — Developer Earnings</h1>
  <div class="sub">You earn 60% of every ad your machine shows.</div>

  <div class="card">
    <h2>Look up earnings</h2>
    <label>Device ID (shown in the extension)</label>
    <input id="device" placeholder="paste your device id" />
    <button onclick="load()">Load</button>
    <div class="msg" id="msg"></div>
  </div>

  <div class="card" id="earnCard" style="display:none">
    <h2>Balance</h2>
    <div style="font-size:32px;font-weight:700" id="bal">₹0.0000</div>
    <button onclick="payout()">Request payout</button>
    <div class="msg" id="poMsg"></div>
  </div>

  <div class="card" id="histCard" style="display:none">
    <h2>Payout history</h2>
    <table><thead><tr><th>Amount</th><th>Status</th><th>Date</th></tr></thead><tbody id="hist"></tbody></table>
  </div>

  <script>
    const API = "";
    async function load() {
      const id = device.value.trim(); if (!id) return;
      const r = await fetch(API + "/v1/developer/earnings?deviceId=" + encodeURIComponent(id));
      if (!r.ok) { msg.textContent = "No developer found for that device id."; return; }
      const d = await r.json();
      msg.textContent = "";
      earnCard.style.display = "block"; histCard.style.display = "block";
      bal.textContent = "₹" + (d.earningsMicros/1000000).toFixed(4);
      hist.innerHTML = d.payouts.length ? d.payouts.map(p =>
        "<tr><td>₹"+(p.amount_micros/1000000).toFixed(4)+"</td><td>"+p.status+"</td><td>"+new Date(p.created_at).toLocaleString()+"</td></tr>"
      ).join("") : "<tr><td colspan='3' style='opacity:.5'>No payouts yet</td></tr>";
    }
    async function payout() {
      const id = device.value.trim();
      const r = await fetch(API + "/v1/developer/payout", { method:"POST", headers:{"content-type":"application/json"}, body: JSON.stringify({ deviceId: id }) });
      const d = await r.json();
      poMsg.textContent = d.ok ? "Payout requested (pending). Status updates once your payout method is connected." : "Nothing to pay out.";
      load();
    }
  </script>`;
  return SHELL("SpinBucks — Developer", body);
}
