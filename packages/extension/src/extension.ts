import * as vscode from "vscode";
import { randomUUID } from "crypto";
import { AdClient, registerDevice, ServedAd } from "./adClient";
import { BusyDetector } from "./busyState";
import { AdViewProvider } from "./webview";

const MICROS_PER_RUPEE = 1_000_000;

export async function activate(context: vscode.ExtensionContext) {
  const out = vscode.window.createOutputChannel("SpinAds");
  const cfg = () => vscode.workspace.getConfiguration("spinads");
  const serverUrl = (): string => cfg().get<string>("serverUrl") || "http://localhost:8080";
  const adDurationMs = (): number => cfg().get<number>("adDurationMs") || 5000;

  // --- stable device identity ---
  let deviceId = context.globalState.get<string>("deviceId");
  if (!deviceId) {
    deviceId = randomUUID();
    await context.globalState.update("deviceId", deviceId);
  }

  // --- earnings status bar ---
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "spinads.showEarnings";
  const renderEarnings = () => {
    const micros = context.globalState.get<number>("earningsMicros") || 0;
    status.text = `$(zap) ₹${(micros / MICROS_PER_RUPEE).toFixed(4)}`;
    status.tooltip = "SpinAds earnings (your 60% share)";
    status.show();
  };
  const addEarnings = async (micros: number) => {
    const total = (context.globalState.get<number>("earningsMicros") || 0) + micros;
    await context.globalState.update("earningsMicros", total);
    renderEarnings();
  };
  renderEarnings();

  // --- ad surface ---
  const provider = new AdViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AdViewProvider.viewType, provider),
  );

  // --- register device with the server (secret stored in SecretStorage) ---
  let client: AdClient | null = null;
  const ensureClient = async (): Promise<AdClient | null> => {
    if (client) return client;
    try {
      let secret = await context.secrets.get("spinads.secret");
      if (!secret) {
        const reg = await registerDevice(serverUrl(), deviceId!);
        secret = reg.secret;
        await context.secrets.store("spinads.secret", secret);
      }
      client = new AdClient(serverUrl(), deviceId!, secret);
      return client;
    } catch (e) {
      out.appendLine(`register error: ${String(e)}`);
      return null;
    }
  };

  // --- the core loop: busy → serve → impression → (click) ---
  let current: ServedAd | null = null;
  let clearTimer: ReturnType<typeof setTimeout> | undefined;

  const showAdNow = async () => {
    const c = await ensureClient();
    if (!c) return;
    try {
      const served = await c.serve();
      if (!served) {
        provider.clear();
        return;
      }
      current = served;
      provider.showAd(served.ad);
      const earned = await c.event(served.serveToken, "impression");
      if (earned) await addEarnings(earned);

      if (clearTimer) clearTimeout(clearTimer);
      clearTimer = setTimeout(() => {
        provider.clear();
        current = null;
      }, adDurationMs());
    } catch (e) {
      out.appendLine(`serve error: ${String(e)}`);
    }
  };

  provider.onClick = async () => {
    if (!current || !client) return;
    vscode.env.openExternal(vscode.Uri.parse(current.ad.destinationUrl));
    const earned = await client.event(current.serveToken, "click");
    if (earned) await addEarnings(earned);
  };

  // --- detection ---
  const detector = new BusyDetector();
  context.subscriptions.push({ dispose: () => detector.dispose() });
  detector.onBusy(() => void showAdNow());
  detector.startPolling();

  // --- commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand("spinads.simulateBusy", () => detector.fire()),
    vscode.commands.registerCommand("spinads.showEarnings", () => {
      const micros = context.globalState.get<number>("earningsMicros") || 0;
      vscode.window.showInformationMessage(`SpinAds: you've earned ₹${(micros / MICROS_PER_RUPEE).toFixed(4)} so far.`);
    }),
    vscode.commands.registerCommand("spinads.reset", async () => {
      await context.secrets.delete("spinads.secret");
      await context.globalState.update("earningsMicros", 0);
      client = null;
      renderEarnings();
      vscode.window.showInformationMessage("SpinAds reset.");
    }),
  );

  out.appendLine(`SpinAds active. device=${deviceId} server=${serverUrl()}`);
}

export function deactivate() {}
