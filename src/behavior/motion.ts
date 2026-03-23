export type Vec2 = { x: number; y: number };

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function len(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function mul(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function norm(v: Vec2): Vec2 {
  const l = len(v);
  if (l < 1e-6) return { x: 1, y: 0 };
  return { x: v.x / l, y: v.y / l };
}

// A small, stable follower that feels “alive”.
export class SpringFollower {
  pos: Vec2;
  vel: Vec2 = { x: 0, y: 0 };

  constructor(start: Vec2) {
    this.pos = { ...start };
  }

  step(target: Vec2, dtSec: number, stiffness = 55, damping = 12) {
    // Semi-implicit Euler on a damped spring.
    const ax = stiffness * (target.x - this.pos.x) - damping * this.vel.x;
    const ay = stiffness * (target.y - this.pos.y) - damping * this.vel.y;
    this.vel.x += ax * dtSec;
    this.vel.y += ay * dtSec;
    this.pos.x += this.vel.x * dtSec;
    this.pos.y += this.vel.y * dtSec;
  }
}

