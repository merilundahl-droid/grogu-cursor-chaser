import type { CursorSample, GroguState, Settings } from "../types";
import type { GroguRig } from "../renderer/groguRig";
import { SpringFollower, clamp } from "./motion";
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
    size_cm: 1.4,
    separation_mm: 10,
  };

  private follower = new SpringFollower({ x: 200, y: 200 });
  private followerTarget: { x: number; y: number } = { x: 0, y: 0 };

  private lastCursor?: CursorDerived;
  private lastRaw?: CursorSample;

  private state: GroguState = "Idle";
  private stateEnteredMs = 0;
  private idleSinceMs = 0;

  // Tunables (feel free to tweak for “maximum cuteness”)
  private idleSpeedPxPerSec = 12;
  private forceAfterIdleMs = 4500;
  private sleepAfterIdleMs = 60_000;

  private crawlMax = 140;
  private walkMax = 620;
  private runMax = 1400;

  private jumpDistancePx = 520;
  private climbAngleBias = 0.78; // vertical dominance ratio

  private lastPxPerMm = Number.NaN;
  private lastGroguHeightMm = Number.NaN;
  private lastSepMm = Number.NaN;
  private lastScale = Number.NaN;
  private sepPx = 0;

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

    if (!this.lastCursor) {
      this.lastCursor = {
        pos: { x: sample.x, y: sample.y },
        winPos: { x: winX, y: winY },
        v: { x: 0, y: 0 },
        speed: 0,
        tMs,
        pxPerMm,
      };
      return;
    }

    const c = this.lastCursor;
    const dt = Math.max(1, tMs - c.tMs) / 1000;
    const vx = (sample.x - c.pos.x) / dt;
    const vy = (sample.y - c.pos.y) / dt;

    c.pos.x = sample.x;
    c.pos.y = sample.y;
    c.winPos.x = winX;
    c.winPos.y = winY;
    c.v.x = vx;
    c.v.y = vy;
    c.speed = Math.hypot(vx, vy);
    c.tMs = tMs;
    c.pxPerMm = pxPerMm;
  }

  update(dtMs: number) {
    if (!this.settings.enabled || !this.lastCursor) return;

    const nowMs = performance.now();
    const dtSec = clamp(dtMs / 1000, 0, 0.05);
    const derived = this.lastCursor;
    const speed = derived.speed;

    // Tick rig animation (Spine or placeholder).
    this.rig.update(dtMs);

    // Convert requested physical size and separation to pixels (per active monitor DPI).
    const groguHeightMm = clamp(this.settings.size_cm, 1.0, 2.0) * 10;
    const sepMm = clamp(this.settings.separation_mm, 0, 20);
    if (
      derived.pxPerMm !== this.lastPxPerMm ||
      groguHeightMm !== this.lastGroguHeightMm ||
      sepMm !== this.lastSepMm
    ) {
      const baseRigHeightPx = 44; // placeholder rig’s approximate height
      const targetHeightPx = groguHeightMm * derived.pxPerMm;
      const scale = targetHeightPx / baseRigHeightPx;

      this.sepPx = sepMm * derived.pxPerMm;
      if (scale !== this.lastScale) {
        this.rig.setScale(scale);
        this.lastScale = scale;
      }

      this.lastPxPerMm = derived.pxPerMm;
      this.lastGroguHeightMm = groguHeightMm;
      this.lastSepMm = sepMm;
    }
    const sepPx = this.sepPx;

    // Choose an offset relative to cursor direction.
    const dirX = speed > 1 ? derived.v.x / speed : 1;
    const dirY = speed > 1 ? derived.v.y / speed : 0;
    const side = dirX < -0.25 ? -1 : 1;

    const targetX = derived.winPos.x + side * sepPx;
    const targetY = derived.winPos.y + 0.65 * sepPx;

    // Keep Grogu in the visible window.
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pad = 40;
    const maxX = Math.max(pad, w - pad);
    const maxY = Math.max(pad, h - pad);
    const clampedX = clamp(targetX, pad, maxX);
    const clampedY = clamp(targetY, pad, maxY);

    // Determine idle time.
    if (speed >= this.idleSpeedPxPerSec) {
      this.idleSinceMs = nowMs;
    }
    const idleFor = nowMs - this.idleSinceMs;

    // Animation state selection.
    const dx = clampedX - this.follower.pos.x;
    const dy = clampedY - this.follower.pos.y;
    const distance = Math.hypot(dx, dy);

    let desired: GroguState = this.state;

    const inTimedState =
      (this.state === "Jump" && nowMs - this.stateEnteredMs < 700) ||
      (this.state === "Tumble" && nowMs - this.stateEnteredMs < 1200);

    if (!inTimedState) {
      if (idleFor >= this.sleepAfterIdleMs) {
        desired = this.state === "Sleep" ? "Sleep" : "Tumble";
      } else if (idleFor >= this.forceAfterIdleMs) {
        desired = "Force";
      } else if (speed < this.idleSpeedPxPerSec) {
        desired = "Idle";
      } else if (distance > this.jumpDistancePx) {
        desired = "Jump";
      } else {
        const verticalDominance = Math.abs(dirY);
        if (dirY < -0.35 && verticalDominance > this.climbAngleBias) {
          desired = "Climb";
        } else if (speed <= this.crawlMax) {
          desired = "Crawl";
        } else if (speed <= this.walkMax) {
          desired = "Walk";
        } else if (speed <= this.runMax) {
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

    // After tumble finishes, go to sleep loop.
    // (Moved earlier so stiffness/damping and motion feel consistent.)
    if (this.state === "Tumble" && nowMs - this.stateEnteredMs >= 1200) {
      this.state = "Sleep";
      this.stateEnteredMs = nowMs;
      this.rig.play("Sleep", { crossfadeMs: 250 });
    }

    // Follow motion tuning varies with state.
    const stiffness =
      this.state === "Run" ? 75 : this.state === "Jump" ? 95 : 55;
    const damping = this.state === "Sleep" ? 20 : 12;

    this.followerTarget.x = clampedX;
    this.followerTarget.y = clampedY;
    this.follower.step(this.followerTarget, dtSec, stiffness, damping);

    // Give “jump” a tiny arc vibe (visual-only).
    if (this.state === "Jump") {
      const t = clamp((nowMs - this.stateEnteredMs) / 700, 0, 1);
      const arc = Math.sin(Math.PI * t) * Math.min(90, distance * 0.12);
      this.rig.container.position.set(this.follower.pos.x, this.follower.pos.y - arc);
    } else {
      this.rig.container.position.set(this.follower.pos.x, this.follower.pos.y);
    }
  }
}

