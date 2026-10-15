import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";
export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export type PredatorKind = C.PredatorKind;
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
  moving: boolean;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
/** Observable hunter readings and the fix/timers that advance them on ticks. */
export interface Predator extends Drifter {
  kind: PredatorKind;
  state: "den" | "wander" | "chase" | "search";
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  sincePing: number;
  searchTime: number;
  searchPing: boolean;
  flareIn: number;
  flareAge: number;
  ramp: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
/** The complete value owned by the engine. No simulation state lives in closures. */
export interface FathomState {
  version: 1;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body;
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: { x: number; y: number; radius: number; remaining: number }[];
  simTime: number;
  remainder: number;
  screenTime: number;
  playTime: number;
  desired: Direction;
  rng: number;
  pointerItem: number | null;
  pendingSonar: boolean;
  pendingInk: boolean;
  assets: Record<string, ImageBitmap[]>;
}
export type ReadState = DeepReadonly<FathomState>;
export const dirs: Direction[] = ["up", "down", "left", "right"];
export const vectors: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};
export const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
export const center = (tx: number, ty: number) => ({
  x: C.GRID_ORIGIN_X + (tx + 0.5) * C.TILE,
  y: C.GRID_ORIGIN_Y + (ty + 0.5) * C.TILE,
  tx,
  ty,
});
export const tileAt = (x: number, y: number) => ({
  tx: Math.floor((x - C.GRID_ORIGIN_X) / C.TILE),
  ty: Math.floor((y - C.GRID_ORIGIN_Y) / C.TILE),
});
export const body = (tx: number, ty: number): Body => ({
  ...center(tx, ty),
  dir: "up",
  moving: false,
});
export const layer = (char: string) =>
  Array.from({ length: C.GRID_ROWS }, () => char.repeat(C.GRID_COLS));
export function change(rows: string[], x: number, y: number, c: string) {
  rows[y] = rows[y].slice(0, x) + c + rows[y].slice(x + 1);
}
/** Copy mutable simulation data; loaded bitmap handles are immutable shared art. */
export const clone = (s: ReadState): FathomState => ({
  ...s,
  forager: { ...s.forager },
  sonar: { ...s.sonar },
  ink: { ...s.ink },
  grid: { ...s.grid },
  tiles: [...s.tiles],
  plankton: [...s.plankton],
  visibility: [...s.visibility],
  drifters: s.drifters.map((d) => ({ ...d })),
  predators: s.predators.map((p) => ({
    ...p,
    fix: p.fix ? { ...p.fix } : null,
  })),
  pulses: s.pulses.map((p) => ({ ...p })),
  inkClouds: s.inkClouds.map((c) => ({ ...c })),
  assets: s.assets as Record<string, ImageBitmap[]>,
});
export function predator(
  kind: PredatorKind,
  tx: number,
  ty: number,
  slot: number | null = null,
): Predator {
  return {
    ...body(tx, ty),
    kind,
    lit: false,
    mind: true,
    travel: true,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    sincePing: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    flareIn: C.FLARE_INTERVAL,
    flareAge: -1,
    ramp: C.GLOAMFIN_RAMP_TIME,
    slot,
  };
}
export function roster(depth: number) {
  return [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ].map((k, i) => predator(k, 16 + (i % 4), 8, i));
}
export const MAZE = [
  "####################################",
  "#######......................#######",
  "#######.#######.####.#######.#######",
  "#######......................#######",
  "#########.#####.####.#####.#########",
  "#########..................#########",
  "#########.#######g########.#########",
  "###.......######dddd######.......###",
  "###.############dddd############.###",
  "#...........####dddd####...........#",
  "#.#####.###.############.###.#####.#",
  "#..................................#",
  "#.#####.#.###.########.###.#.#####.#",
  "....................................",
  "#.#######.#.############.#.#######.#",
  "#..................................#",
  "####################################",
  "####################################",
];
export function fresh(
  assets: Record<string, ImageBitmap[]> = {},
  muted = false,
): FathomState {
  return reconcile({
    version: 1,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: C.VISION_MIN,
    windowRadius: C.KINDLE_VISION_MIN,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles: [...MAZE],
    plankton: MAZE.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: body(17, 15),
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    remainder: 0,
    screenTime: 0,
    playTime: 0,
    desired: "up",
    rng: 62417,
    pointerItem: null,
    pendingSonar: false,
    pendingInk: false,
    assets,
  });
}
export function reconcile(input: ReadState): FathomState {
  const s = clone(input);
  Object.assign(s.forager, tileAt(s.forager.x, s.forager.y));
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.reduce(
    (n, r) => n + [...r].filter((c) => c === "*").length,
    0,
  );
  for (const d of [...s.drifters, ...s.predators])
    Object.assign(d, tileAt(d.x, d.y));
  for (const p of s.predators) {
    p.speed =
      p.kind === "lanternjaw" && p.state !== "chase"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? C.GLOAMFIN_CORNER_SPEED +
            (C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) *
              Math.min(1, p.ramp / C.GLOAMFIN_RAMP_TIME)
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  }
  return s;
}
export function screen(s: FathomState, value: Screen) {
  s.screen = value;
  if (value !== "playing") {
    s.pendingSonar = false;
    s.pendingInk = false;
  }
  s.menuIndex =
    value === "title"
      ? s.titleIndex
      : value === "paused" || value === "gameover"
        ? 0
        : null;
  s.screenTime = 0;
}
export function random(s: FathomState) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export function neighbor(s: ReadState, x: number, y: number, d: Direction) {
  const [dx, dy] = vectors[d];
  let nx = x + dx;
  const ny = y + dy;
  if (nx < 0 || nx >= C.GRID_COLS) {
    const wrap = s.tiles.findIndex(
      (r) => r[0] === "." && r[C.GRID_COLS - 1] === ".",
    );
    if (y !== wrap) return null;
    nx = (nx + C.GRID_COLS) % C.GRID_COLS;
  }
  return ny < 0 || ny >= C.GRID_ROWS ? null : { tx: nx, ty: ny };
}
export function open(s: ReadState, x: number, y: number, den = false) {
  const c = s.tiles[y]?.[x];
  return c === "." || (den && (c === "g" || c === "d"));
}
export function choices(
  s: ReadState,
  b: { tx: number; ty: number },
  den = false,
) {
  return dirs.filter((d) => {
    const n = neighbor(s, b.tx, b.ty, d);
    return n && open(s, n.tx, n.ty, den);
  });
}
export function distances(s: ReadState, tx: number, ty: number, den = false) {
  const out = new Map<string, number>();
  if (!open(s, tx, ty, den)) return out;
  const q = [{ tx, ty }];
  out.set(`${tx},${ty}`, 0);
  for (let i = 0; i < q.length; i++) {
    const p = q[i],
      dist = out.get(`${p.tx},${p.ty}`)!;
    for (const d of choices(s, p, den)) {
      const n = neighbor(s, p.tx, p.ty, d)!;
      const key = `${n.tx},${n.ty}`;
      if (!out.has(key)) {
        out.set(key, dist + 1);
        q.push(n);
      }
    }
  }
  return out;
}
export function route(
  s: ReadState,
  b: Body,
  target: { tx: number; ty: number },
  den = false,
): Direction | null {
  const map = distances(s, target.tx, target.ty, den);
  let best = Infinity,
    result: Direction | null = null;
  for (const d of choices(s, b, den)) {
    const n = neighbor(s, b.tx, b.ty, d)!;
    const cost = map.get(`${n.tx},${n.ty}`) ?? Infinity;
    if (cost < best) {
      best = cost;
      result = d;
    }
  }
  return result;
}
/** Super-sampled segment traversal includes the destination rock but never sees through it. */
export function sight(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  wallEnd = false,
) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
  const end = tileAt(b.x, b.y);
  for (let i = 0; i <= steps; i++) {
    const t = steps ? i / steps : 0;
    const p = tileAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (
      s.tiles[p.ty]?.[p.tx] === "#" &&
      !(wallEnd && p.tx === end.tx && p.ty === end.ty)
    )
      return false;
  }
  return true;
}
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export function blinded(s: ReadState, p: Predator) {
  const f = s.forager,
    dx = f.x - p.x,
    dy = f.y - p.y;
  return s.inkClouds.some((c) => {
    const t = Math.max(
      0,
      Math.min(
        1,
        ((c.x - p.x) * dx + (c.y - p.y) * dy) / (dx * dx + dy * dy || 1),
      ),
    );
    return Math.hypot(p.x + t * dx - c.x, p.y + t * dy - c.y) <= c.radius;
  });
}
/** Integrates to each center exactly, carrying remaining distance across turns and wraps. */
export function move(
  s: FathomState,
  b: Body,
  speed: number,
  decide: () => Direction | null,
  den = false,
) {
  if (!open(s, b.tx, b.ty, den)) {
    b.moving = false;
    return;
  }
  let left = speed * C.TICK_DT;
  b.moving = false;
  while (left > 1e-8) {
    const c = center(b.tx, b.ty);
    const at = Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6;
    if (at) {
      const d = decide();
      if (!d) return;
      b.dir = d;
      const n = neighbor(s, b.tx, b.ty, d);
      if (!n || !open(s, n.tx, n.ty, den)) return;
    }
    const [dx, dy] = vectors[b.dir];
    let target = dx ? c.x : c.y;
    const pos = dx ? b.x : b.y;
    const sign = dx || dy;
    if (sign * (target - pos) <= 1e-7) target += sign * C.TILE;
    const step = Math.min(left, Math.abs(target - pos));
    b.x += dx * step;
    b.y += dy * step;
    const min = C.GRID_ORIGIN_X,
      max = min + C.GRID_COLS * C.TILE;
    if (b.x < min) b.x += max - min;
    if (b.x >= max) b.x -= max - min;
    Object.assign(b, tileAt(b.x, b.y));
    b.moving = true;
    left -= step;
  }
}
export function wander(s: FathomState, b: Body, den = false) {
  let opts = choices(s, b, den).filter((d) => d !== opposite[b.dir]);
  if (!opts.length) opts = choices(s, b, den);
  return opts.length ? opts[Math.floor(random(s) * opts.length)] : null;
}
