import * as vscode from "vscode";

/**
 * Detects when the coding agent is busy ("thinking") — that's when we show an ad.
 *
 * Public editor APIs do NOT expose another extension's/agent's internal spinner
 * state, so there are two strategies:
 *
 *  1. Manual / demo  — `fire()` is called by the "Simulate agent busy" command.
 *                      Works in any VS Code / Antigravity install, today.
 *
 *  2. Antigravity hook (plug point) — Antigravity runs a local agent server whose
 *     responses can be observed (see the community `antigravity-panel` toolkit).
 *     Wire that signal into `startPolling()` and call `fire()` when a task begins.
 *     This needs tuning on a real Antigravity install.
 */
export class BusyDetector {
  private readonly _onBusy = new vscode.EventEmitter<void>();
  readonly onBusy = this._onBusy.event;
  private timer?: ReturnType<typeof setInterval>;

  fire(): void {
    this._onBusy.fire();
  }

  /** Plug point for the Antigravity agent signal. Left as a stub to tune on-device. */
  startPolling(intervalMs = 2000): void {
    this.timer = setInterval(() => {
      // TODO(antigravity): query the local Antigravity agent server here; when a
      // task transitions to "running"/"thinking", call this.fire(). Until wired,
      // automatic detection stays off and the demo command drives it.
    }, intervalMs);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this._onBusy.dispose();
  }
}
