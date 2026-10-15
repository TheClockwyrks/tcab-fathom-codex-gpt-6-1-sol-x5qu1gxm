import * as C from "./constants";
import {
  type ReadState,
  type FathomState,
  type Direction,
  type Screen,
  type PredatorKind,
  fresh,
  clone,
  reconcile,
  screen,
  roster,
  layer,
  change,
  center,
  open,
  predator,
  body,
} from "./model";
const screens: Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "cleared",
  "gameover",
];
function valid(ok: boolean): asserts ok {
  if (!ok) throw new RangeError("Fathom: invalid debug pose");
}
function number(n: number, min = 0, max = Infinity, integer = false) {
  valid(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function tile(s: ReadState, x: number, y: number, den = false) {
  number(x, 0, C.GRID_COLS - 1, true);
  number(y, 0, C.GRID_ROWS - 1, true);
  valid(open(s, x, y, den));
}
function dir(d: Direction) {
  valid(["up", "down", "left", "right"].includes(d));
}
export const items = (s: ReadState): readonly string[] =>
  s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
export const menuItemRect = (s: ReadState, index: number) =>
  Number.isInteger(index) && index >= 0 && index < items(s).length
    ? { x: 480, y: 410 + index * 62, w: 320, h: 48 }
    : null;
const pose = (s: ReadState, fn: (s: FathomState) => void) => {
  const next = clone(s);
  fn(next);
  return reconcile(next);
};
function hunter(s: FathomState, i: number) {
  number(i, 0, s.predators.length - 1, true);
  return s.predators[i];
}
function drifter(s: FathomState, i: number) {
  number(i, 0, s.drifters.length - 1, true);
  return s.drifters[i];
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) =>
    fresh(s.assets as Record<string, ImageBitmap[]>, s.muted),
  snapshot: (s: ReadState) => {
    const r = reconcile(s);
    return {
      version: r.version,
      screen: r.screen,
      menuIndex: r.menuIndex,
      titleIndex: r.titleIndex,
      depth: r.depth,
      score: r.score,
      lives: r.lives,
      muted: r.muted,
      planktonRemaining: r.planktonRemaining,
      drifterIn: r.drifterIn,
      brightness: r.brightness,
      brightHold: r.brightHold,
      visionRadius: r.visionRadius,
      windowRadius: r.windowRadius,
      sonar: r.sonar,
      ink: r.ink,
      grid: r.grid,
      tiles: r.tiles,
      plankton: r.plankton,
      visibility: r.visibility,
      forager: r.forager,
      drifters: r.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
        x,
        y,
        tx,
        ty,
        lit,
        mind,
        travel,
      })),
      predators: r.predators.map(
        ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }) => ({
          kind,
          x,
          y,
          tx,
          ty,
          dir,
          state,
          released,
          mind,
          travel,
          speed,
          alert,
          lit,
          detectRange,
          hearingRange,
          hearingLock,
          flareCharging,
          flaring,
          flareRadius,
        }),
      ),
      pulses: r.pulses.map(({ source, tint, ox, oy, front, range }) => ({
        source,
        tint,
        ox,
        oy,
        front,
        range,
      })),
      inkClouds: r.inkClouds,
      simTime: r.simTime,
    };
  },
  reconcile,
  setScreen: (s: ReadState, value: Screen) =>
    pose(s, (n) => {
      valid(screens.includes(value));
      screen(n, value);
      if (value === "playing" && s.screen !== "paused") n.playTime = 0;
    }),
  setMenuIndex: (s: ReadState, index: number) =>
    pose(s, (n) => {
      number(index, 0, items(s).length - 1, true);
      n.menuIndex = index;
    }),
  setTitleIndex: (s: ReadState, index: number) =>
    pose(s, (n) => {
      number(index, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = index;
    }),
  menuItemRect,
  setScore: (s: ReadState, points: number) =>
    pose(s, (n) => {
      number(points, 0, Infinity, true);
      n.score = points;
    }),
  setLives: (s: ReadState, lives: number) =>
    pose(s, (n) => {
      number(lives, 0, Infinity, true);
      n.lives = lives;
    }),
  setDepth: (s: ReadState, depth: number) =>
    pose(s, (n) => {
      number(depth, 1, Infinity, true);
      n.depth = depth;
      n.predators = roster(depth);
      n.playTime = 0;
    }),
  setMaze: (s: ReadState, rows: readonly string[]) =>
    pose(s, (n) => {
      valid(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.gd]+$/.test(r)),
      );
      const all = rows.join("");
      valid(
        !/[dg]/.test(all) || [...all].filter((c) => c === "g").length === 1,
      );
      n.tiles = [...rows];
    }),
  setPlankton: (s: ReadState, x: number, y: number, present: boolean) =>
    pose(s, (n) => {
      tile(s, x, y);
      valid(typeof present === "boolean");
      change(n.plankton, x, y, present ? "*" : "-");
    }),
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = layer("u");
    }),
  setForagerTile: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      tile(s, x, y);
      Object.assign(n.forager, center(x, y), { moving: false });
    }),
  setForagerDir: (s: ReadState, value: Direction) =>
    pose(s, (n) => {
      dir(value);
      n.forager.dir = value;
      n.forager.moving = false;
      n.desired = value;
    }),
  setBrightness: (s: ReadState, g: number) =>
    pose(s, (n) => {
      number(g, 0, 1);
      n.brightness = g;
    }),
  setBrightHold: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds, 0, C.BRIGHT_HOLD);
      n.brightHold = seconds;
    }),
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, kind: PredatorKind, x: number, y: number) =>
    pose(s, (n) => {
      valid(C.DEN_ORDER.includes(kind));
      tile(s, x, y);
      n.predators.push(predator(kind, x, y));
    }),
  setPredatorTile: (s: ReadState, i: number, x: number, y: number) =>
    pose(s, (n) => {
      tile(s, x, y, true);
      Object.assign(hunter(n, i), center(x, y));
    }),
  setPredatorDir: (s: ReadState, i: number, value: Direction) =>
    pose(s, (n) => {
      dir(value);
      hunter(n, i).dir = value;
    }),
  setPredatorState: (
    s: ReadState,
    i: number,
    value: "den" | "wander" | "chase",
  ) =>
    pose(s, (n) => {
      valid(["den", "wander", "chase"].includes(value));
      const p = hunter(n, i);
      valid(
        value === "den"
          ? "dg".includes(n.tiles[p.ty]?.[p.tx])
          : n.tiles[p.ty]?.[p.tx] === ".",
      );
      p.state = value;
      p.fix = value === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = value === "chase" ? C.LINGER_TIME : 0;
      p.ramp = C.GLOAMFIN_RAMP_TIME;
      p.alert = false;
      p.alertLeft = 0;
    }),
  setPredatorReleased: (s: ReadState, i: number, enabled: boolean) =>
    pose(s, (n) => {
      valid(typeof enabled === "boolean");
      hunter(n, i).released = enabled;
    }),
  setPredatorMind: (s: ReadState, i: number, enabled: boolean) =>
    pose(s, (n) => {
      valid(typeof enabled === "boolean");
      hunter(n, i).mind = enabled;
    }),
  setPredatorTravel: (s: ReadState, i: number, enabled: boolean) =>
    pose(s, (n) => {
      valid(typeof enabled === "boolean");
      hunter(n, i).travel = enabled;
    }),
  spawnDrifter: (s: ReadState, x: number, y: number) =>
    pose(s, (n) => {
      tile(s, x, y);
      n.drifters.push({ ...body(x, y), lit: false, mind: true, travel: true });
    }),
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, i: number, enabled: boolean) =>
    pose(s, (n) => {
      valid(typeof enabled === "boolean");
      drifter(n, i).mind = enabled;
    }),
  setDrifterTravel: (s: ReadState, i: number, enabled: boolean) =>
    pose(s, (n) => {
      valid(typeof enabled === "boolean");
      drifter(n, i).travel = enabled;
    }),
  setDrifterIn: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = seconds;
    }),
  setSonarCooldown: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds);
      n.sonar.cooldown = seconds;
    }),
  setInkCooldown: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds);
      n.ink.cooldown = seconds;
    }),
};
export type FathomDebugApi = typeof debug;
