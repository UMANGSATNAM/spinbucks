import * as vscode from "vscode";
import type { ServedAd } from "./adClient";

export class AdViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "spinads.adView";
  private view?: vscode.WebviewView;

  /** Set by the extension; invoked when the user clicks the ad. */
  public onClick?: () => void;

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.render(null);
    view.webview.onDidReceiveMessage((m) => {
      if (m?.type === "click") this.onClick?.();
    });
  }

  showAd(ad: ServedAd["ad"]): void {
    if (this.view) this.view.webview.html = this.render(ad);
  }

  clear(): void {
    if (this.view) this.view.webview.html = this.render(null);
  }

  private render(ad: ServedAd["ad"] | null): string {
    const body = ad
      ? `<div class="ad" onclick="click()">
           <div class="tag">Sponsored</div>
           <div class="line">${escapeHtml(ad.adLine)}</div>
           ${ad.brandName ? `<div class="brand">${escapeHtml(ad.brandName)}</div>` : ""}
         </div>`
      : `<div class="idle">Waiting for the agent… you earn while it thinks.</div>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
  content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); margin: 0; padding: 10px; }
  .ad { cursor: pointer; border: 1px solid var(--vscode-panel-border); border-radius: 8px; padding: 12px; }
  .ad:hover { border-color: var(--vscode-focusBorder); }
  .tag { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; opacity: .6; }
  .line { font-size: 14px; margin-top: 4px; }
  .brand { font-size: 11px; opacity: .7; margin-top: 6px; }
  .idle { font-size: 12px; opacity: .6; }
</style></head><body>
${body}
<script>
  const vscode = acquireVsCodeApi();
  function click(){ vscode.postMessage({ type: "click" }); }
</script>
</body></html>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
