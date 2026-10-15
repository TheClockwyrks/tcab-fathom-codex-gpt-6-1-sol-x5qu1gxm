import * as C from "./constants";
import {
  type FathomState,
  type ReadState,
  type Predator,
  type Direction,
  clone,
  fresh,
  reconcile,
  screen,
  roster,
  body,
  center,
  change,
  distance,
  sight,
  blinded,
  distances,
  choices,
  neighbor,
  route,
  move,
  wander,
  opposite,
} from "./model";
/** A tick owns all simulation timers; epsilon removes floating point residue at boundaries. */
const remaining = (value: number) => (value < 1e-9 ? 0 : value);
export type Emit = (cue: C.CueName) => void;
export function begin(input: ReadState) {
  const s = fresh(input.assets as Record<string, ImageBitmap[]>, input.muted);
  s.simTime = input.simTime;
  s.remainder = input.remainder;
  s.titleIndex = input.titleIndex;
  screen(s, "countdown");
  return s;
}
export function title(input: ReadState) {
  const s = begin(input);
  screen(s, "title");
  return s;
}
export function attempt(s: FathomState) {
  s.forager = body(17, 15);
  s.desired = "up";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.playTime = 0;
  screen(s, "countdown");
}
export function cast(s: FathomState, emit: Emit) {
  if (s.sonar.cooldown > 0) return;
  s.sonar.cooldown = C.SONAR_COOLDOWN;
  s.pulses.push({
    source: "forager",
    tint: "cyan",
    ox: s.forager.tx,
    oy: s.forager.ty,
    front: 0,
    range: s.sonar.range,
    owner: null,
    caught: false,
  });
  emit(C.CUES.sonar);
}
export function ink(s: FathomState, emit: Emit) {
  if (s.ink.cooldown > 0) return;
  s.ink.cooldown = C.INK_COOLDOWN;
  s.inkClouds.push({
    x: s.forager.x,
    y: s.forager.y,
    radius: C.INK_RADIUS,
    remaining: C.INK_LIFE,
  });
  emit(C.CUES.ink);
}
export function acquire(s: FathomState, p: Predator, freshAcquisition = false) {
  if (p.state !== "chase" || freshAcquisition) {
    if (p.kind !== "lanternjaw") p.alertLeft = C.ALERT_TIME;
    p.ramp = C.GLOAMFIN_RAMP_TIME;
  }
  p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
  if (p.alert) p.lit = true;
  p.state = "chase";
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.linger = C.LINGER_TIME;
  // A bloom that locks stops lighting immediately, but its art still collapses.
  if (p.kind === "flarefish" && p.flaring)
    p.flareAge = C.FLARE_CHARGE + C.FLARE_BLOOM;
  else if (p.flareAge < C.FLARE_CHARGE + C.FLARE_BLOOM) p.flareAge = -1;
  p.flareCharging = p.kind === "flarefish" ? false : null;
  p.flaring = p.kind === "flarefish" ? false : null;
  p.flareRadius = p.kind === "flarefish" ? 0 : null;
  const d = route(s, p, p.fix);
  if (d === opposite[p.dir]) p.dir = d;
}
function drop(p: Predator) {
  p.state = "wander";
  p.fix = null;
  p.flareIn = C.FLARE_INTERVAL;
}
function ping(
  s: FathomState,
  p: Predator,
  index: number,
  tint: "violet" | "orange",
  emit: Emit,
) {
  s.pulses.push({
    source: "gloamfin",
    tint,
    ox: p.tx,
    oy: p.ty,
    front: 0,
    range: C.GLOAMFIN_PING_RANGE,
    owner: index,
    caught: false,
  });
  p.pingIn = C.GLOAMFIN_PING_INTERVAL;
  p.sincePing = 0;
  emit(C.CUES.predatorPing);
}
function mind(s: FathomState, p: Predator, index: number, emit: Emit) {
  const dt = C.TICK_DT;
  p.mark = remaining(p.mark - dt);
  p.alertLeft = remaining(p.alertLeft - dt);
  p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
  if (!p.mind) return;
  if (p.state === "den") {
    if (p.slot !== null && s.playTime + 1e-8 >= p.slot * C.DEN_RELEASE_GAP)
      p.released = true;
    if (!p.released || !s.tiles.some((row) => row.includes("d"))) return;
    const gate = s.tiles
      .flatMap((r, y) => [...r].map((c, x) => ({ c, tx: x, ty: y })))
      .find((t) => t.c === "g");
    if (!gate) return;
    const exit = choices(s, gate, true)
      .map((d) => neighbor(s, gate.tx, gate.ty, d)!)
      .find((n) => s.tiles[n.ty][n.tx] === ".");
    if (!exit) return;
    if (s.tiles[p.ty]?.[p.tx] === ".") p.state = "wander";
    else if (p.travel) move(s, p, p.speed, () => route(s, p, exit, true), true);
    return;
  }
  if (p.kind === "gloamfin") {
    const had = p.hearingLock;
    p.hearingLock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
    if (p.hearingLock) acquire(s, p, !had);
    else if (had) p.pingIn = 0;
    p.pingIn = remaining(p.pingIn - dt);
    p.sincePing += dt;
    if (
      p.state === "chase" &&
      p.fix &&
      p.tx === p.fix.tx &&
      p.ty === p.fix.ty &&
      !p.hearingLock &&
      distance(p, center(p.tx, p.ty)) < 2
    ) {
      p.state = "search";
      p.searchTime = 0;
      p.searchPing = false;
    }
    if (p.state === "search") {
      p.searchTime += dt;
      if (p.searchTime + 1e-9 >= C.GLOAMFIN_GIVEUP) drop(p);
    }
    const guaranteed =
      p.state === "search" &&
      p.searchTime + 1e-9 >= C.GLOAMFIN_SEARCH_DELAY &&
      !p.searchPing;
    if (
      !p.hearingLock &&
      p.sincePing + 1e-9 >= C.GLOAMFIN_PING_MIN_GAP &&
      (guaranteed || p.pingIn <= 0)
    ) {
      ping(s, p, index, guaranteed ? "orange" : "violet", emit);
      if (guaranteed) p.searchPing = true;
    }
    p.ramp = Math.min(C.GLOAMFIN_RAMP_TIME, p.ramp + dt);
  } else {
    if (p.kind === "flarefish") {
      if (p.state === "wander") {
        if (p.flareAge < 0) {
          p.flareIn -= dt;
          if (p.flareIn <= 1e-9) p.flareAge = 0;
        } else p.flareAge += dt;
        p.flareCharging = p.flareAge >= 0 && p.flareAge + 1e-9 < C.FLARE_CHARGE;
        p.flaring =
          p.flareAge + 1e-9 >= C.FLARE_CHARGE &&
          p.flareAge + 1e-9 < C.FLARE_CHARGE + C.FLARE_BLOOM;
        p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
        if (
          p.flareAge + 1e-9 >= C.FLARE_CHARGE &&
          p.flareAge - dt + 1e-9 < C.FLARE_CHARGE
        )
          emit(C.CUES.flare);
        if (p.flareAge + 1e-9 >= C.FLARE_CHARGE + C.FLARE_BLOOM + 0.3) {
          p.flareAge = -1;
          p.flareIn = C.FLARE_INTERVAL - 0.3;
        }
      } else {
        if (p.flareAge >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
          p.flareAge += dt;
          if (p.flareAge + 1e-9 >= C.FLARE_CHARGE + C.FLARE_BLOOM + 0.3)
            p.flareAge = -1;
        }
        p.flareCharging = false;
        p.flaring = false;
        p.flareRadius = 0;
      }
    }
    const blind = blinded(s, p);
    const sensed =
      !blind &&
      ((distance(p, s.forager) <= p.detectRange! && sight(s, p, s.forager)) ||
        (p.flaring && distance(p, s.forager) <= C.FLARE_RADIUS));
    if (blind) {
      if (p.state === "chase") drop(p);
    } else if (sensed) acquire(s, p);
    else if (p.state === "chase") {
      p.linger -= dt;
      if (p.linger <= 1e-9) drop(p);
    }
  }
  p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
  if (p.travel) {
    const old = p.dir;
    move(s, p, p.speed, () => {
      let d: Direction | null;
      if (p.state === "chase" && p.fix) {
        if (p.tx === p.fix.tx && p.ty === p.fix.ty) return null;
        d = route(s, p, p.fix);
      } else if (
        p.state === "search" &&
        p.fix &&
        Math.abs(p.tx - p.fix.tx) + Math.abs(p.ty - p.fix.ty) >=
          C.GLOAMFIN_SEARCH_ROAM
      )
        d = route(s, p, p.fix);
      else d = wander(s, p);
      if (
        d &&
        p.kind === "gloamfin" &&
        p.state === "chase" &&
        d !== p.dir &&
        d !== opposite[p.dir]
      )
        p.ramp = 0;
      return d;
    });
    if (
      p.kind === "gloamfin" &&
      p.state === "chase" &&
      old !== p.dir &&
      p.dir !== opposite[old]
    )
      p.speed = C.GLOAMFIN_CORNER_SPEED;
  }
}
export function light(s: FathomState) {
  const flares = s.predators.filter((p) => p.flaring && p.state !== "den");
  const lit = (a: { x: number; y: number }, wall = false) =>
    distance(a, s.forager) <= s.visionRadius && sight(s, s.forager, a, wall);
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const c = center(x, y);
      const v =
        lit(c, true) || flares.some((p) => distance(p, c) <= C.FLARE_RADIUS);
      change(
        s.visibility,
        x,
        y,
        v ? "l" : s.visibility[y][x] === "u" ? "u" : "r",
      );
    }
  for (const p of s.predators) {
    p.lit =
      p.state !== "den" &&
      (lit(p) ||
        p.mark > 0 ||
        p.alert ||
        flares.some((f) => distance(p, f) <= C.FLARE_RADIUS));
  }
  for (const d of s.drifters)
    d.lit = lit(d) || flares.some((f) => distance(d, f) <= C.FLARE_RADIUS);
}
function waves(s: FathomState) {
  for (const p of s.pulses) {
    const previous = p.front;
    p.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const map = distances(s, p.ox, p.oy, true);
    const reached = (tx: number, ty: number) => {
      const d = map.get(`${tx},${ty}`);
      return (
        d !== undefined &&
        d <= p.range &&
        d <= p.front &&
        (d > previous || (d === 0 && previous === 0))
      );
    };
    if (p.source === "forager") {
      for (const [key, d] of map) {
        if (d > p.range || d > p.front || d < previous) continue;
        const [x, y] = key.split(",").map(Number);
        change(s.visibility, x, y, "l");
        for (const dir of ["up", "down", "left", "right"] as const) {
          const n = neighbor(s, x, y, dir);
          if (n && s.tiles[n.ty][n.tx] === "#")
            change(s.visibility, n.tx, n.ty, "l");
        }
      }
      for (const hunter of s.predators)
        if (
          hunter.state !== "den" &&
          reached(hunter.tx, hunter.ty) &&
          hunter.kind !== "lanternjaw"
        ) {
          hunter.mark = C.SONAR_MARK_TIME;
          hunter.lit = true;
          if (hunter.kind === "gloamfin" && hunter.mind)
            acquire(s, hunter, true);
        }
    } else if (!p.caught && reached(s.forager.tx, s.forager.ty)) {
      p.caught = true;
      const hunter = p.owner === null ? null : s.predators[p.owner];
      if (hunter?.mind && hunter.state !== "den") acquire(s, hunter, true);
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
export function tick(
  input: ReadState,
  held: Direction | null,
  emitRaw: Emit,
): FathomState {
  const emitted = new Set<C.CueName>();
  const emit: Emit = (cue) => {
    if (!emitted.has(cue)) {
      emitted.add(cue);
      emitRaw(cue);
    }
  };
  let s = clone(input);
  s.simTime += C.TICK_DT;
  s.screenTime += C.TICK_DT;
  if (s.screen === "countdown") {
    light(s);
    if (s.screenTime + 1e-9 >= 2) {
      screen(s, "playing");
      s.playTime = 0;
      for (const p of s.predators)
        if (p.slot === 0 && p.mind) p.released = true;
    }
    return reconcile(s);
  }
  if (s.screen === "cleared") {
    if (s.screenTime + 1e-9 >= 2) {
      const depth = s.depth + 1,
        score = s.score,
        lives = s.lives;
      s = begin(s);
      s.depth = depth;
      s.score = score;
      s.lives = lives;
      s.predators = roster(depth);
    }
    return reconcile(s);
  }
  if (s.screen !== "playing") return s;
  // Edges arriving between ticks wait here; casts and cues share the tick's clock.
  if (s.pendingSonar) cast(s, emit);
  if (s.pendingInk) ink(s, emit);
  s.pendingSonar = false;
  s.pendingInk = false;
  s.playTime += C.TICK_DT;
  s.sonar.cooldown = remaining(s.sonar.cooldown - C.TICK_DT);
  s.ink.cooldown = remaining(s.ink.cooldown - C.TICK_DT);
  const decay = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = remaining(s.brightHold - C.TICK_DT);
  s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: remaining(c.remaining - C.TICK_DT) }))
    .filter((c) => c.remaining > 0);
  if (held) {
    s.desired = held;
    if (held === opposite[s.forager.dir]) s.forager.dir = held;
    move(s, s.forager, C.FORAGER_SPEED, () =>
      choices(s, s.forager).includes(s.desired)
        ? s.desired
        : choices(s, s.forager).includes(s.forager.dir)
          ? s.forager.dir
          : null,
    );
  } else s.forager.moving = false;
  const f = s.forager;
  if (s.tiles[f.ty]?.[f.tx] === "." && s.plankton[f.ty]?.[f.tx] === "*") {
    change(s.plankton, f.tx, f.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    emit(C.CUES.eat);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      screen(s, "cleared");
      emit(C.CUES.descend);
      return reconcile(s);
    }
  }
  s.drifterIn = remaining(s.drifterIn - C.TICK_DT);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const y = s.tiles.findIndex((r) => r.includes("g")),
      x = y < 0 ? -1 : s.tiles[y].indexOf("g");
    if (x >= 0) {
      const exit = choices(s, { tx: x, ty: y })
        .map((d) => neighbor(s, x, y, d)!)
        .find((n) => s.tiles[n.ty][n.tx] === ".");
      if (exit)
        s.drifters.push({
          ...body(exit.tx, exit.ty),
          lit: false,
          mind: true,
          travel: true,
        });
      s.drifterIn = C.DRIFTER_INTERVAL;
    }
  }
  for (const d of s.drifters)
    if (d.mind && d.travel) move(s, d, C.DRIFTER_SPEED, () => wander(s, d));
  s.drifters = s.drifters.filter((d) => {
    if (d.tx === f.tx && d.ty === f.ty) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  s = reconcile(s);
  s.predators.forEach((p, i) => mind(s, p, i, emit));
  s = reconcile(s);
  light(s);
  waves(s);
  if (
    s.predators.some(
      (p) =>
        (p.state !== "den" || s.tiles.some((row) => row.includes("d"))) &&
        p.tx === s.forager.tx &&
        p.ty === s.forager.ty,
    )
  ) {
    emit(C.CUES.caught);
    if (s.lives === 0) screen(s, "gameover");
    else {
      s.lives--;
      attempt(s);
    }
  }
  return reconcile(s);
}
