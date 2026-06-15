# SpinAds (extension)

Shows a sponsored line in the **SpinAds** panel while your AI coding agent is busy.
You earn **60%** of the ad revenue your machine generates.

## Install
1. Build the `.vsix` (see below) or use the provided `spinads.vsix`.
2. **Antigravity:** `antigravity --install-extension spinads.vsix`
   **VS Code:** `code --install-extension spinads.vsix` (or Extensions panel → ⋯ → Install from VSIX).
3. Set `spinads.serverUrl` in Settings to your ad server (default `http://localhost:8080`).
4. Open the **SpinAds** panel (bottom panel). Run **"SpinAds: Simulate agent busy (demo)"** from
   the Command Palette to see an ad render and your earnings tick up.

## How it works
- On first run it registers this device and stores a per-device secret.
- When the agent is busy it calls the server's `/serve`, shows the ad, and reports an impression.
- Clicking the ad opens the link and reports a click (billed at 50× the impression rate).
- All calls are HMAC-signed; the status bar shows your running earnings.
