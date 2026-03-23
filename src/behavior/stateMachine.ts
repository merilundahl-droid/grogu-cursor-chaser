import type { CursorSample, GroguState, Settings } from "../types";
import type { GroguRig } from "../renderer/groguRig";
import { SpringFollower, clamp, len, norm, sub } from "./motion";
import { invoke } from "@tauri-apps/api/tauri";

type CursorDerived = {
  pos: { x: number; y: number };
  winPos: { x: number; y: number };
  v: { x: number; y: number };
  speed: number;
  tMs: number;
  pxPerMm: number;
};

export class BehaviorController {
  private rig: GroguRig;
  private settings: Settings = {
    enabled: true,
    force_enabled: false,
    size_cm: 1.4,
    separation_mm: 5,
  };

  private follower = new SpringFollower({ x: 200, y: 200 });

  private lastCursor?: CursorDerived;
  private lastRaw?: CursorSample;

  private state: GroguState = "Idle";
  private stateEnteredMs = 0;
  private idleSinceMs = 0;
  private lastForceNudgeMs = 0;

  // Tunables (feel free to tweak for “maximum cuteness”)
  private idleSpeedPxPerSec = 12;
  private forceAfterIdleMs = 4500;
  private sleepAfterIdleMs = 60_000;

  private crawlMax = 140;
  private walkMax = 620;
  private runMax = 1400;

  private jumpDistancePx = 520;
  private climbAngleBias = 0.78; // vertical dominance ratio

  constructor(rig: GroguRig) {
    this.rig = rig;
    this.stateEnteredMs = performance.now();
    this.idleSinceMs = performance.now();
    this.rig.play("Idle");
  }

  setSettings(s: Settings) {
    this.settings = s;
  }

  onCursorSample(sample: CursorSample) {
    this.lastRaw = sample;

    const winX = sample.x - sample.vs_x;
    const winY = sample.y - sample.vs_y;
    const tMs = sample.t_ms;
    const pxPerMm = sample.px_per_mm;

    let v = { x: 0, y: 0 };
    let speed = 0;

    if (this.lastCursor) {
      const dt = Math.max(1, tMs - this.lastCursor.tMs) / 1000;
      v = {
        x: (sample.x - this.lastCursor.pos.x) / dt,
        y: (sample.y - this.lastCursor.pos.y) / dt,
      };
      speed = Math.hypot(v.x, v.y);
    }

    this.lastCursor = {
      pos: { x: sample.x, y: sample.y },
      winPos: { x: winX, y: winY },
      v,
      speed,
      tMs,
      pxPerMm,
    };
  }

  update(dtMs: number) {
    if (!this.settings.enabled || !this.lastCursor) return;

    const nowMs = performance.now();
    const dtSec = clamp(dtMs / 1000, 0, 0.05);

    const derived = this.lastCursor;

    // Tick rig animation (Spine or placeholder).
    this.rig.update(dtMs);

    // Convert requested physical size and separation to pixels (per active monitor DPI).
    const groguHeightMm = clamp(this.settings.size_cm, 1.0, 2.0) * 10;
    const targetHeightPx = groguHeightMm * derived.pxPerMm;
    const baseRigHeightPx = 44; // placeholder rig’s approximate height
    this.rig.setScale(targetHeightPx / baseRigHeightPx);

    const separationMm = clamp(this.settings.separation_mm, 3, 7);
    const sepPx = separationMm * derived.pxPerMm;

    // Choose an offset relative to cursor direction.
    const moveDir = derived.speed > 1 ? norm(derived.v) : { x: 1, y: 0 };
    const preferLeft = moveDir.x < -0.25;
    const side = preferLeft ? -1 : 1;

    const target = {
      x: derived.winPos.x + side * sepPx,
      y: derived.winPos.y + 0.65 * sepPx,
    };

    // Keep Grogu in the visible window.
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 40;
    const clampedTarget = {
      x: clamp(target.x, pad, Math.max(pad, w - pad)),
      y: clamp(target.y, pad, Math.max(pad, h - pad)),
    };

    // Determine idle time.
    if (derived.speed < this.idleSpeedPxPerSec) {
      if (nowMs - this.idleSinceMs < 1) {
        // no-op (first frame)
      }
    } else {
      this.idleSinceMs = nowMs;
    }
    const idleFor = nowMs - this.idleSinceMs;

    // Animation state selection.
    const toTarget = sub(clampedTarget, this.follower.pos);
    const distance = len(toTarget);

    let desired: GroguState = this.state;

    const inTimedState =
      (this.state === "Jump" && nowMs - this.stateEnteredMs < 700) ||
      (this.state === "Tumble" && nowMs - this.stateEnteredMs < 1200);

    if (!inTimedState) {
      if (idleFor >= this.sleepAfterIdleMs) {
        desired = this.state === "Sleep" ? "Sleep" : "Tumble";
      } else if (idleFor >= this.forceAfterIdleMs) {
        desired = "Force";
      } else if (derived.speed < this.idleSpeedPxPerSec) {
        desired = "Idle";
      } else if (distance > this.jumpDistancePx) {
        desired = "Jump";
      } else {
        const dir = norm(derived.v);
        const verticalDominance = Math.abs(dir.y);
        if (dir.y < -0.35 && verticalDominance > this.climbAngleBias) {
          desired = "Climb";
        } else if (derived.speed <= this.crawlMax) {
          desired = "Crawl";
        } else if (derived.speed <= this.walkMax) {
          desired = "Walk";
        } else if (derived.speed <= this.runMax) {
          desired = "Run";
        } else {
          desired = "Run";
        }
      }
    }

    if (desired !== this.state) {
      this.state = desired;
      this.stateEnteredMs = nowMs;
      this.rig.play(desired, { crossfadeMs: 200 });
    }

    // Follow motion tuning varies with state.
    const stiffness =
      this.state === "Run" ? 75 : this.state === "Jump" ? 95 : 55;
    const damping = this.state === "Sleep" ? 20 : 12;

    this.follower.step(clampedTarget, dtSec, stiffness, damping);

    // Give “jump” a tiny arc vibe (visual-only).
    if (this.state === "Jump") {
      const t = clamp((nowMs - this.stateEnteredMs) / 700, 0, 1);
      const arc = Math.sin(Math.PI * t) * Math.min(90, distance * 0.12);
      this.rig.container.position.set(this.follower.pos.x, this.follower.pos.y - arc);
    } else {
      this.rig.container.position.set(this.follower.pos.x, this.follower.pos.y);
    }

    // After tumble finishes, go to sleep loop.
    if (this.state === "Tumble" && nowMs - this.stateEnteredMs >= 1200) {
      this.state = "Sleep";
      this.stateEnteredMs = nowMs;
      this.rig.play("Sleep", { crossfadeMs: 250 });
    }

    // Optional: tiny cursor “Force” nudges (rate-limited, very small).
    if (this.state === "Force" && this.settings.force_enabled) {
      if (nowMs - this.lastForceNudgeMs > 850) {
        this.lastForceNudgeMs = nowMs;
        const phase = nowMs / 500;
        const dx = Math.round(Math.cos(phase) * 1);
        const dy = Math.round(Math.sin(phase) * 1);
        void invoke("force_nudge_cursor", { dx, dy });
      }
    }
  }
}

