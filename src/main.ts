import { Application } from "pixi.js";
import { GroguRig, createGroguRig } from "./renderer/groguRig";
import { BehaviorController } from "./behavior/stateMachine";
import type { CursorSample, Settings } from "./types";

function isTauriRuntime(): boolean {
  // Tauri v1 injects window.__TAURI__ in the webview.
  return typeof (window as unknown as { __TAURI__?: unknown }).__TAURI__ !== "undefined";
}

function approxPxPerMm(): number {
  // Browser can't reliably read monitor DPI; approximate using 96 DPI baseline.
  // devicePixelRatio accounts for OS scaling (good enough for online preview).
  const dpr = window.devicePixelRatio || 1;
  const approxDpi = 96 * dpr;
  return approxDpi / 25.4;
}

async function main() {
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app root");

  const app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
  });
  root.appendChild(app.canvas);

  let settings: Settings = {
    enabled: true,
    force_enabled: false,
    size_cm: 1.4,
    separation_mm: 5,
  };

  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/tauri");
    settings = (await invoke<Settings>("get_settings")) satisfies Settings;
  }

  const rig: GroguRig = await createGroguRig(app.stage);
  const behavior = new BehaviorController(rig);

  behavior.setSettings(settings);

  if (isTauriRuntime()) {
    const { listen } = await import("@tauri-apps/api/event");

    await listen<Settings>("settings", (evt) => {
      settings = evt.payload;
      behavior.setSettings(settings);
    });

    await listen<CursorSample>("cursor_sample", (evt) => {
      behavior.onCursorSample(evt.payload);
    });
  } else {
    // Web preview mode: feed cursor samples from regular mouse movement.
    let lastMoveAt = performance.now();
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;

    window.addEventListener(
      "mousemove",
      (e) => {
        x = e.clientX;
        y = e.clientY;
        lastMoveAt = performance.now();

        const sample: CursorSample = {
          t_ms: Date.now(),
          x,
          y,
          vs_x: 0,
          vs_y: 0,
          dpi: Math.round(approxPxPerMm() * 25.4),
          px_per_mm: approxPxPerMm(),
        };
        behavior.onCursorSample(sample);
      },
      { passive: true }
    );

    // When idle (no mousemove), still send samples so idle timers progress.
    setInterval(() => {
      const now = performance.now();
      if (now - lastMoveAt > 50) {
        const sample: CursorSample = {
          t_ms: Date.now(),
          x,
          y,
          vs_x: 0,
          vs_y: 0,
          dpi: Math.round(approxPxPerMm() * 25.4),
          px_per_mm: approxPxPerMm(),
        };
        behavior.onCursorSample(sample);
      }
    }, 50);
  }

  app.ticker.add((ticker) => {
    behavior.update(ticker.deltaMS);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});

