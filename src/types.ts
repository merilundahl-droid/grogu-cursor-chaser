export type Settings = {
  enabled: boolean;
  size_cm: number;
  separation_mm: number;
};

export type CursorSample = {
  t_ms: number;
  x: number;
  y: number;
  vs_x: number;
  vs_y: number;
  dpi: number;
  px_per_mm: number;
};

export type GroguState =
  | "Idle"
  | "Crawl"
  | "Walk"
  | "Run"
  | "Climb"
  | "Jump"
  | "Force"
  | "Tumble"
  | "Sleep";

