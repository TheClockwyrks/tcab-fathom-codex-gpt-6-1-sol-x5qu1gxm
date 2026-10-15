/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import {
  ConstantClock,
  createEngine,
  SequenceClock,
  type Clock,
} from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import { debug } from "./debug";
import {
  fresh,
  center,
  choices,
  distances,
  MAZE,
  type FathomState,
} from "./model";
import { cast, ink, tick } from "./simulation";
import * as C from "./constants";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (path: string) => new Response(new Uint8Array(await readFile(path))),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
});
afterAll(() => vi.unstubAllGlobals());
async function setup(clock: Clock = new ConstantClock(1000 / 60)) {
  const events = new EventTarget();
  const canvas = createCanvas(
    C.STAGE_W,
    C.STAGE_H,
  ) as unknown as HTMLCanvasElement;
  const engine = createEngine({
    canvas,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: BACKGROUND,
    layout: C.LAYOUT,
    game,
    clock,
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => events,
    },
  });
  await engine.initialize();
  const key = (code: string, down = true) =>
    events.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  return { engine, key, events };
}
const emptyMaze = () =>
  Array.from({ length: C.GRID_ROWS }, (_, y) =>
    y === 5 ? "#" + ".".repeat(34) + "#" : "#".repeat(36),
  );
function fixture() {
  let s = debug.setMaze(fresh(), emptyMaze());
  s = debug.clearPlankton(s);
  s = debug.clearPredators(s);
  s = debug.setForagerTile(s, 5, 5);
  return debug.setScreen(s, "playing");
}
function steps(s: FathomState, n: number) {
  for (let i = 0; i < n; i++) s = tick(s, null, () => {});
  return s;
}

describe("maze contract", () => {
  it("is connected, symmetric, narrow, looped, and within all three proportions", () => {
    const s = fresh();
    let count = 0,
      degree = 0;
    const twos = new Set<string>();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = MAZE[y][x],
          mirror = MAZE[y][C.GRID_COLS - 1 - x];
        if (!"dg".includes(t) && !"dg".includes(mirror)) expect(t).toBe(mirror);
        if (t !== ".") continue;
        count++;
        const n = choices(s, { tx: x, ty: y }).length;
        expect(n).toBeGreaterThanOrEqual(2);
        degree += n;
        if (n === 2) twos.add(`${x},${y}`);
        expect(
          MAZE[y + 1]?.slice(x, x + 2) === ".." &&
            MAZE[y].slice(x, x + 2) === "..",
        ).toBe(false);
      }
    expect(distances(s, 17, 15).size).toBe(count);
    expect(
      count / ((C.GRID_COLS - 2) * (C.GRID_ROWS - 2)),
    ).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(degree / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    const runs: number[] = [];
    while (twos.size) {
      const queue = [twos.values().next().value!];
      let size = 0;
      for (let i = 0; i < queue.length; i++) {
        const key = queue[i];
        if (!twos.delete(key)) continue;
        size++;
        const [tx, ty] = key.split(",").map(Number);
        for (const d of choices(s, { tx, ty })) {
          const [dx, dy] = {
            up: [0, -1],
            down: [0, 1],
            left: [-1, 0],
            right: [1, 0],
          }[d];
          queue.push(`${(tx + dx + 36) % 36},${ty + dy}`);
        }
      }
      runs.push(size);
    }
    const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(mean).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(mean).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
    expect(MAZE.join("").split("g").length - 1).toBe(1);
    expect(MAZE.join("").split("d").length - 1).toBe(12);
  });
});
describe("engine integration", () => {
  it("loads all sheets, registers actions, exposes debug, and renders every screen", async () => {
    const { engine } = await setup();
    expect(engine.debug.version).toBe(1);
    expect(engine.state.assets["trench-walls"]).toHaveLength(19);
    for (const screen of [
      "title",
      "howto",
      "countdown",
      "playing",
      "paused",
      "cleared",
      "gameover",
    ] as const) {
      engine.apply((s) => debug.setScreen(s, screen));
      await engine.advance(1);
    }
    expect(engine.diagnostics().every((d) => d.error === undefined)).toBe(true);
    engine.destroy();
  });
  it("starts, pauses, resumes, mutes, and travels from real engine actions", async () => {
    const { engine, key } = await setup();
    key("Enter");
    await engine.advance(1);
    key("Enter", false);
    expect(engine.state.screen).toBe("countdown");
    await engine.advance(122);
    expect(engine.state.screen).toBe("playing");
    key("Escape");
    await engine.advance(1);
    key("Escape", false);
    expect(engine.state.screen).toBe("paused");
    const pos = engine.state.forager.x;
    await engine.advance(2);
    expect(engine.state.forager.x).toBe(pos);
    key("Escape");
    await engine.advance(1);
    key("Escape", false);
    expect(engine.state.screen).toBe("playing");
    key("KeyM");
    await engine.advance(1);
    expect(engine.state.muted).toBe(true);
    engine.apply(() => fixture());
    const x = engine.state.forager.x;
    key("ArrowRight");
    await engine.advance(30);
    expect(engine.state.forager.x - x).toBeCloseTo(C.FORAGER_SPEED * 0.5);
    key("ArrowRight", false);
    await engine.advance(1);
    expect(engine.state.forager.moving).toBe(false);
    engine.destroy();
  });
  it("keeps fixed ticks identical across different frame partitions", async () => {
    const a = await setup(new ConstantClock(25));
    const b = await setup(new SequenceClock([10, 40]));
    a.engine.apply(() => fixture());
    b.engine.apply(() => fixture());
    a.key("ArrowRight");
    b.key("ArrowRight");
    await a.engine.advance(20);
    await b.engine.advance(20);
    expect(debug.snapshot(a.engine.state)).toEqual(
      debug.snapshot(b.engine.state),
    );
    a.engine.destroy();
    b.engine.destroy();
  });
  it("confirms pointer menus only when both edges are in the same item", async () => {
    const { engine, events } = await setup();
    const event = (type: string, x: number, y: number) =>
      events.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    event("pointerdown", 600, 430);
    event("pointerup", 600, 490);
    await engine.advance(1);
    expect(engine.state.screen).toBe("title");
    event("pointerdown", 600, 490);
    event("pointerup", 600, 490);
    await engine.advance(1);
    expect(engine.state.screen).toBe("howto");
    expect(engine.state.titleIndex).toBe(1);
    event("pointerdown", 20, 20);
    event("pointerup", 20, 20);
    await engine.advance(1);
    expect(engine.state.menuIndex).toBe(1);
    engine.destroy();
  });
});
describe("simulation", () => {
  it("eats on tile entry, brightens, holds, decays and clears only through eating", () => {
    let s = fixture();
    expect(steps(s, 1).screen).toBe("playing");
    s = debug.setPlankton(s, 5, 5, true);
    s = debug.setPlankton(s, 6, 5, true);
    const original = debug.snapshot(s);
    s = steps(s, 1);
    expect(s.score).toBe(C.SCORE_PLANKTON);
    expect(s.brightness).toBe(C.BRIGHT_PER_EAT);
    expect(original.score).toBe(0);
    s = steps(s, 120);
    expect(s.brightness).toBeCloseTo(C.BRIGHT_PER_EAT);
    s = steps(s, 108);
    expect(s.brightness).toBeCloseTo(C.BRIGHT_PER_EAT / 2);
    s = debug.setForagerTile(s, 6, 5);
    s = steps(s, 1);
    expect(s.screen).toBe("cleared");
    expect(s.score).toBe(2 * C.SCORE_PLANKTON + C.SCORE_CLEAR);
    s = steps(s, 241);
    expect(s.depth).toBe(2);
    expect(s.screen).toBe("countdown");
  });
  it("retains memory outside the circle and clears it only when requested", () => {
    let s = fixture();
    s = steps(s, 1);
    expect(s.visibility[5][5]).toBe("l");
    s = debug.setForagerTile(s, 25, 5);
    s = steps(s, 1);
    expect(s.visibility[5][5]).toBe("r");
    s = debug.clearFog(s);
    expect(debug.reconcile(s).visibility.every((r) => /^u+$/.test(r))).toBe(
      true,
    );
  });
  it("carries wrap distance continuously and respects walls", () => {
    let s = debug.clearPredators(fresh());
    s = debug.clearPlankton(s);
    s = debug.setForagerTile(s, 0, 13);
    s = debug.setForagerDir(s, "left");
    s = debug.setScreen(s, "playing");
    for (let i = 0; i < 30; i++) s = tick(s, "left", () => {});
    expect(s.forager.x).toBeCloseTo(center(35, 13).x);
    s = debug.setMaze(s, emptyMaze());
    const x = s.forager.x;
    s = tick(s, "right", () => {});
    expect(s.forager.x).toBe(x);
  });
  it("floods around corners, marks hunters but leaves amber bodies unresolved", () => {
    let s = fixture();
    s = debug.addPredator(s, "gloamfin", 10, 5);
    s = debug.addPredator(s, "lanternjaw", 10, 5);
    s.predators.forEach((p) => {
      p.mind = false;
      p.travel = false;
    });
    const cues: string[] = [];
    cast(s, (c) => cues.push(c));
    expect(s.pulses[0].front).toBe(0);
    expect(s.predators[0].mark).toBe(0);
    s = steps(s, 44);
    expect(s.predators[0].mark).toBeGreaterThan(0);
    expect(s.predators[1].mark).toBe(0);
    expect(s.visibility[5][10]).not.toBe("u");
    expect(cues).toEqual([C.CUES.sonar]);
  });
  it("blinds visual hunters immediately but never blocks close hearing", () => {
    let s = fixture();
    s = debug.addPredator(s, "lanternjaw", 8, 5);
    s = debug.addPredator(s, "gloamfin", 7, 5);
    s.predators.forEach((p) => (p.travel = false));
    s = steps(s, 1);
    expect(s.predators[0].state).toBe("chase");
    ink(s, () => {});
    s = steps(s, 1);
    expect(s.predators[0].state).toBe("wander");
    expect(s.predators[1].hearingLock).toBe(true);
    expect(s.predators[1].state).toBe("chase");
  });
  it("holds a last-seen fix for two seconds after losing light", () => {
    let s = fixture();
    s = debug.addPredator(s, "lanternjaw", 8, 5);
    s.predators[0].travel = false;
    s = steps(s, 1);
    expect(s.predators[0].state).toBe("chase");
    s = debug.setForagerTile(s, 25, 5);
    s = steps(s, 120);
    expect(s.predators[0].state).toBe("chase");
    s = steps(s, 121);
    expect(s.predators[0].state).toBe("wander");
  });
  it("charges and blooms on schedule, reveals through rock, and can lock during a bloom", () => {
    let s = fixture();
    s = debug.addPredator(s, "flarefish", 25, 5);
    s.predators[0].travel = false;
    s = steps(s, 841);
    expect(s.predators[0].flareCharging).toBe(true);
    s = steps(s, 61);
    expect(s.predators[0].flaring).toBe(true);
    expect(s.visibility[4][25]).toBe("l");
    s = debug.setForagerTile(s, 20, 5);
    s = steps(s, 1);
    expect(s.predators[0].state).toBe("chase");
    expect(s.predators[0].alert).toBe(true);
    expect(s.predators[0].flaring).toBe(false);
  });
  it("stops a body with its mind off while travel off leaves sensing active", () => {
    let s = fixture();
    s = debug.addPredator(s, "gloamfin", 7, 5);
    s = debug.setPredatorMind(s, 0, false);
    const x = s.predators[0].x;
    s = steps(s, 60);
    expect(s.predators[0].x).toBe(x);
    expect(s.predators[0].state).toBe("wander");
    s = debug.setPredatorMind(s, 0, true);
    s = debug.setPredatorTravel(s, 0, false);
    s = steps(s, 1);
    expect(s.predators[0].x).toBe(x);
    expect(s.predators[0].state).toBe("chase");
    expect(s.predators[0].speed).toBe(C.GLOAMFIN_CHASE_SPEED);
  });
  it("contact consumes reserve lives, preserves eaten plankton, and ends the last attempt", () => {
    let s = fixture();
    s = debug.addPredator(s, "lanternjaw", 5, 5);
    s = debug.setPredatorMind(s, 0, false);
    s = debug.setLives(s, 1);
    s = steps(s, 1);
    expect(s.lives).toBe(0);
    expect(s.screen).toBe("countdown");
    expect(s.planktonRemaining).toBe(0);
    s = debug.setMaze(s, emptyMaze());
    s = debug.clearPredators(s);
    s = debug.setForagerTile(s, 5, 5);
    s = debug.addPredator(s, "flarefish", 5, 5);
    s = debug.setPredatorMind(s, 0, false);
    s = debug.setScreen(s, "playing");
    s = steps(s, 1);
    expect(s.screen).toBe("gameover");
    expect(s.lives).toBe(0);
  });
  it("admits and eats bonus drifters with the exact score", () => {
    let s = fixture();
    s = debug.spawnDrifter(s, 5, 5);
    s = debug.setDrifterMind(s, 0, false);
    s = steps(s, 1);
    expect(s.score).toBe(C.SCORE_DRIFTER);
    expect(s.drifters).toHaveLength(0);
  });
});
describe("pursuit and timing boundaries", () => {
  it("paths around rock on shortest routes and pays the Gloamfin corner penalty", () => {
    const rows = Array.from({ length: C.GRID_ROWS }, () =>
      "#".repeat(C.GRID_COLS),
    );
    const edit = (y: number, x: number) => {
      rows[y] = rows[y].slice(0, x) + "." + rows[y].slice(x + 1);
    };
    for (let x = 5; x <= 9; x++) edit(7, x);
    for (let y = 5; y <= 7; y++) {
      edit(y, 5);
      edit(y, 9);
    }
    let s = debug.setMaze(fresh(), rows);
    s = debug.clearPlankton(s);
    s = debug.clearPredators(s);
    s = debug.setForagerTile(s, 9, 5);
    s = debug.addPredator(s, "gloamfin", 5, 5);
    s = debug.setPredatorState(s, 0, "chase");
    s = debug.setScreen(s, "playing");
    expect(s.predators[0].speed).toBe(C.GLOAMFIN_CHASE_SPEED);
    s = tick(s, null, () => {});
    expect(s.predators[0].dir).toBe("down");
    // A reversal leaves the opening cap unchanged; the first perpendicular corner costs speed.
    expect(s.predators[0].speed).toBe(C.GLOAMFIN_CHASE_SPEED);
    for (let i = 0; i < 70 && s.predators[0].dir !== "right"; i++)
      s = tick(s, null, () => {});
    expect(s.predators[0].dir).toBe("right");
    expect(s.predators[0].speed).toBe(C.GLOAMFIN_CORNER_SPEED);
    s = debug.setPredatorTravel(s, 0, false);
    s = steps(s, 120);
    expect(s.predators[0].speed).toBeCloseTo(
      (C.GLOAMFIN_CORNER_SPEED + C.GLOAMFIN_CHASE_SPEED) / 2,
    );
    expect(s.tiles[s.predators[0].ty][s.predators[0].tx]).toBe(".");
  });
  it("searches an abandoned sound fix and casts one orange lost-you ping", () => {
    let s = fixture();
    s = debug.setForagerTile(s, 10, 5);
    s = debug.addPredator(s, "gloamfin", 5, 5);
    s = debug.setPredatorState(s, 0, "chase");
    s = debug.setPredatorDir(s, 0, "right");
    s = debug.setForagerTile(s, 30, 5);
    let oranges = 0,
      lastFront = -1;
    for (let i = 0; i < 420; i++) {
      s = tick(s, null, () => {});
      const orange = s.pulses.find((p) => p.tint === "orange");
      if (orange && orange.front < lastFront) oranges++;
      if (orange && lastFront < 0) oranges++;
      lastFront = orange?.front ?? -1;
    }
    expect(s.predators[0].state).toBe("search");
    expect(oranges).toBe(1);
    expect(Math.abs(s.predators[0].tx - 10)).toBeLessThanOrEqual(
      C.GLOAMFIN_SEARCH_ROAM,
    );
    s = steps(s, 360);
    expect(s.predators[0].state).toBe("wander");
  });
  it("releases on schedule even with travel disabled and ends countdown after exactly two seconds", () => {
    let s = debug.setScreen(fresh(), "countdown");
    s.predators.forEach((p) => (p.travel = false));
    s = steps(s, 240);
    expect(s.screen).toBe("playing");
    expect(s.predators[0].released).toBe(true);
    expect(s.predators[1].released).toBe(false);
    s = steps(s, 600);
    expect(s.predators[1].released).toBe(true);
    expect(s.predators[1].state).toBe("den");
    expect(s.predators[2].released).toBe(false);
    s = steps(s, 600);
    expect(s.predators[2].released).toBe(true);
  });
  it("makes cooldowns ready on their exact tick and emits a shared cue once per tick", () => {
    let s = fixture();
    s = debug.setSonarCooldown(s, C.SONAR_COOLDOWN);
    s = debug.setInkCooldown(s, C.INK_COOLDOWN);
    s = steps(s, C.SONAR_COOLDOWN * C.TICK_HZ);
    expect(s.sonar.ready).toBe(true);
    s = steps(s, (C.INK_COOLDOWN - C.SONAR_COOLDOWN) * C.TICK_HZ);
    expect(s.ink.ready).toBe(true);
    s = debug.addPredator(s, "gloamfin", 20, 5);
    s = debug.addPredator(s, "gloamfin", 25, 5);
    s.predators.forEach((p) => {
      p.travel = false;
      p.pingIn = 0;
    });
    const cues: string[] = [];
    s = tick(s, null, (cue) => cues.push(cue));
    expect(s.pulses).toHaveLength(2);
    expect(cues.filter((c) => c === C.CUES.predatorPing)).toHaveLength(1);
  });
});
describe("posed edge cases", () => {
  it("queues a cast between ticks and plays its cue on the completed tick", async () => {
    const { engine, key } = await setup(new ConstantClock(500 / C.TICK_HZ));
    engine.apply(() => fixture());
    const cues: string[] = [];
    engine.events.on("cue:played", (e) => cues.push(e.cue));
    key("Space");
    await engine.advance(1);
    expect(engine.state.pulses).toHaveLength(0);
    expect(cues).toHaveLength(0);
    await engine.advance(1);
    expect(engine.state.pulses).toHaveLength(1);
    expect(cues).toEqual([C.CUES.sonar]);
    engine.destroy();
  });
  it("holds den bodies out of play on fixtures without a chamber", () => {
    let s = debug.clearPlankton(fresh());
    s = debug.setMaze(s, emptyMaze());
    s = debug.setForagerTile(s, 5, 5);
    s = debug.setPredatorTile(s, 0, 5, 5);
    s = debug.setScreen(s, "playing");
    s = steps(s, 120);
    expect(s.lives).toBe(C.START_LIVES);
    expect(s.predators[0].state).toBe("den");
    expect(s.predators[0].lit).toBe(false);
    // On a maze with a chamber, a posed body still makes contact with its mind off.
    s = debug.clearPlankton(fresh());
    s = debug.setPredatorTile(s, 0, 17, 15);
    s = debug.setPredatorMind(s, 0, false);
    s = debug.setScreen(s, "playing");
    s = steps(s, 1);
    expect(s.lives).toBe(C.START_LIVES - 1);
  });
});
describe("debug contract", () => {
  it("validates invalid poses loudly and allows arbitrary fixture layouts", () => {
    const s = fresh();
    expect(() => debug.setMaze(s, ["bad"])).toThrow();
    expect(() => debug.setScore(s, -1)).toThrow();
    expect(() => debug.setBrightness(s, 2)).toThrow();
    expect(() => debug.setPredatorMind(s, 50, false)).toThrow();
    expect(() =>
      debug.setMenuIndex(debug.setScreen(s, "playing"), 0),
    ).toThrow();
    expect(debug.setMaze(s, emptyMaze()).tiles).toEqual(emptyMaze());
  });
  it("reconciles without advancing systems, and reset restores every observable field", () => {
    let s = fixture();
    s = debug.setDepth(s, 9);
    s = debug.setBrightness(s, 0.7);
    s = debug.setBrightHold(s, 0.8);
    s = debug.setSonarCooldown(s, 15);
    s = debug.setInkCooldown(s, 22);
    s = debug.setScore(s, 1234);
    s = debug.setLives(s, 7);
    s = debug.setDrifterIn(s, 4);
    s = debug.clearFog(s);
    const before = debug.snapshot(s);
    expect(debug.snapshot(debug.reconcile(s))).toEqual(before);
    expect(debug.snapshot(debug.reset(s))).toEqual(debug.snapshot(fresh()));
    expect(s.predators).toHaveLength(6);
    expect(s.sonar.range).toBe(C.SONAR_RANGE_MIN);
  });
  it("freezes the world on pause but keeps the global simulation clock", () => {
    let s = fixture();
    s = debug.setSonarCooldown(s, 1);
    s = debug.setScreen(s, "paused");
    s = steps(s, 120);
    expect(s.simTime).toBeCloseTo(1);
    expect(s.sonar.cooldown).toBe(1);
    expect(s.forager.moving).toBe(false);
  });
});
