import { Container, Graphics } from "pixi.js";
import type { GroguState } from "../types";

export type GroguRig = {
  container: Container;
  play(state: GroguState, opts?: { crossfadeMs?: number }): void;
  setScale(scale: number): void;
  update(dtMs: number): void;
};

export async function createGroguRig(parent: Container): Promise<GroguRig> {
  // Placeholder rig that keeps the app runnable without any external animation runtime.
  const rig = new PlaceholderGroguRig();
  parent.addChild(rig.container);
  return rig;
}

class PlaceholderGroguRig implements GroguRig {
  container = new Container();
  // Separate motion layer so `BehaviorController` can position `container`
  // without clobbering internal bob offsets.
  private motion = new Container();
  // Placeholder rig draws head+face separately from the torso so we can
  // change "body height" without scaling head/ears.
  private torso = new Graphics();
  private head = new Graphics();
  private leftEar = new Graphics();
  private rightEar = new Graphics();
  private t = 0;
  private current: GroguState = "Idle";
  // Visual-only: torso is ~half the height, while head/ears keep full scale.
  private readonly bodyHeightFactor = 0.5;

  constructor() {
    this.container.eventMode = "none";
    this.container.addChild(this.motion);

    // Place ears so they attach to the sides of the head.
    // (Torso height is shortened, but head/ears should keep their full scale.)
    // Move ears up so their bases start around the middle of the head.
    this.leftEar.position.set(-12, -16);
    this.rightEar.position.set(12, -16);
    // Draw torso first, then ears, then head so the head stays visible in front.
    this.motion.addChild(this.torso, this.leftEar, this.rightEar, this.head);

    // Anchor torso scaling at its bottom so the "shortening" feels stable.
    // The torso roundRect is drawn from y=-14 to y=+12 at scale=1 (see redraw()).
    this.torso.pivot.set(0, 12);
    this.torso.scale.set(1, this.bodyHeightFactor);

    this.redraw(1);
  }

  play(state: GroguState): void {
    this.current = state;
  }

  setScale(scale: number): void {
    this.container.scale.set(scale);
    // Keep head/ears at the container's scale; only torso gets an extra vertical squash.
    this.torso.scale.set(1, this.bodyHeightFactor);
  }

  update(dtMs: number): void {
    this.t += dtMs;

    // Simple “alive” motion that varies with state.
    const baseBob = this.current === "Sleep" ? 0.6 : 1.0;
    const bob = Math.sin(this.t / 240) * 1.2 * baseBob;
    // Apply bob as a local offset to the motion layer.
    this.motion.y += (bob - this.motion.y) * 0.08;

    const earWiggle =
      // Reduced amplitude so ear movement feels subtler.
      this.current === "Force" ? 0.1 : this.current === "Run" ? 0.07 : 0.035;
    const a = Math.sin(this.t / 180) * earWiggle;
    this.leftEar.rotation = -0.35 + a;
    this.rightEar.rotation = 0.35 - a;

    // Subtle squash/stretch for “jump”.
    const squish =
      this.current === "Jump" ? 1.0 + Math.sin(this.t / 90) * 0.08 : 1.0;
    // Apply squash/stretch only to the torso; head/ears should not change size.
    const targetTorsoYScale = this.bodyHeightFactor * squish;
    this.torso.scale.y += (targetTorsoYScale - this.torso.scale.y) * 0.12;
  }

  private redraw(scale: number) {
    const s = scale;

    this.torso.clear();
    this.torso.roundRect(-10 * s, -14 * s, 20 * s, 26 * s, 8 * s);
    // Becomes a beige sack over Grogu's body (head + ears stay as-is).
    this.torso.fill({ color: 0xD9C3A3, alpha: 0.98 });
    // Subtle seam/texture lines for the sack look.
    this.torso.lineStyle(1.2 * s, 0xB59A73, 0.38);
    for (let y = -10 * s; y <= 8 * s; y += 6 * s) {
      this.torso.moveTo(-7 * s, y);
      this.torso.lineTo(7 * s, y - 0.6 * s);
    }
    for (let x = -6 * s; x <= 6 * s; x += 6 * s) {
      this.torso.moveTo(x, -11 * s);
      this.torso.lineTo(x + 0.7 * s, 10 * s);
    }
    this.torso.lineStyle(1.0 * s, 0xA8875F, 0.22);
    this.torso.moveTo(-7 * s, 2 * s);
    this.torso.lineTo(7 * s, 1.2 * s);

    this.head.clear();
    this.head.circle(0, -20 * s, 12 * s);
    this.head.fill({ color: 0x7dbf7d, alpha: 0.95 });

    // Face details (kept with the head so "body-only" resize works).
    this.head.circle(-4 * s, -22 * s, 1.3 * s);
    this.head.circle(4 * s, -22 * s, 1.3 * s);
    this.head.fill({ color: 0x101010, alpha: 0.9 });

    const ear = (g: Graphics, sign: -1 | 1) => {
      g.clear();
      // Stretch ears horizontally (thickness) without changing their vertical size.
      g.roundRect(-18 * s * 1.8, -4 * s, 18 * s * 1.8, 8 * s, 4 * s * 1.8);
      g.fill({ color: 0x7dbf7d, alpha: 0.92 });
      g.roundRect(-16 * s * 1.8, -2 * s, 14 * s * 1.8, 4 * s, 2 * s * 1.8);
      g.fill({ color: 0xd7a6a6, alpha: 0.55 });
      g.pivot.set(0, 0);
      g.scale.set(sign, 1);
    };

    ear(this.leftEar, -1);
    ear(this.rightEar, 1);
  }
}

