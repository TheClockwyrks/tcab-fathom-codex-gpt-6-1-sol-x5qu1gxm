import "./style.css";
import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  type FathomState,
  type Direction,
  clone,
  fresh,
  reconcile,
  screen,
} from "./model";
import { debug, items, menuItemRect, type FathomDebugApi } from "./debug";
import { begin, title, tick } from "./simulation";
import { render } from "./render";
export type {
  FathomState,
  Direction,
  Screen,
  PredatorKind,
  Body,
  Predator,
  Drifter,
  Pulse,
} from "./model";
export type { FathomDebugApi } from "./debug";
export { BACKGROUND } from "./render";
export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const name of C.ACTIONS)
      api.input.register(name, { keys: [...C.BINDINGS[name]] });
    const tones = [
      [720, 980, 55],
      [180, 800, 450],
      [90, 45, 350],
      [350, 90, 600],
      [70, 1200, 600],
      [180, 35, 650],
      [330, 990, 900],
    ];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        wave: i === 2 ? "triangle" : "sine",
        freq: tones[i][0],
        freqTo: tones[i][1],
        durationMs: tones[i][2],
        gain: 0.12,
      }),
    );
    const assets: Record<string, ImageBitmap[]> = {};
    await Promise.all(
      Object.entries({
        glimmerfin: 8,
        lanternjaw: 16,
        gloamfin: 8,
        flarefish: 8,
        drifter: 8,
        "flare-bloom": 8,
        "trench-walls": 19,
      }).map(async ([sheet, count]) => {
        assets[sheet] = await Promise.all(
          Array.from({ length: count }, (_, i) =>
            api.assets.loadImage(`${sheet}/${i}.png`),
          ),
        );
      }),
    );
    for (const key of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(key, (s) => s[key]);
    api.diagnostics.register("sonar", (s) => s.sonar.cooldown);
    api.diagnostics.register("ink", (s) => s.ink.cooldown);
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < 6; i++)
      api.diagnostics.register(`predator ${i}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "none";
      });
    return [fresh(assets), debug];
  },
  update(state, api, dt) {
    let s = clone(state);
    const pressed = Object.fromEntries(
      C.ACTIONS.map((a) => [a, api.input.pressed(a)]),
    );
    if (pressed.mute) api.audio.setMuted(!api.audio.muted());
    s.muted = api.audio.muted();
    const emit = (cue: C.CueName) => api.audio.play(cue);
    const startScreen = s.screen;
    let confirm = pressed.confirm;
    const samples = api.input.pointerSamples().filter((p) => p.primary);
    for (const p of samples) {
      const hit = items(s).findIndex((_, i) => {
        const r = menuItemRect(s, i)!;
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      });
      if (hit >= 0) s.menuIndex = hit;
      if (p.type === "down")
        s.pointerItem = s.screen === "howto" ? -2 : hit >= 0 ? hit : null;
      if (p.type === "up") {
        if (s.screen === "howto" && s.pointerItem === -2) confirm = true;
        else if (hit >= 0 && hit === s.pointerItem) confirm = true;
        s.pointerItem = null;
      }
    }
    if (startScreen === "playing") {
      if (pressed.pause) screen(s, "paused");
      else {
        if (pressed.a) s.pendingSonar = true;
        if (pressed.b) s.pendingInk = true;
      }
    } else if (startScreen === "paused" && (pressed.pause || pressed.back))
      screen(s, "playing");
    else if (startScreen === "howto" && (confirm || pressed.back)) s = title(s);
    else if (items(s).length) {
      const list = items(s);
      if (pressed.up)
        s.menuIndex = ((s.menuIndex ?? 0) - 1 + list.length) % list.length;
      if (pressed.down) s.menuIndex = ((s.menuIndex ?? 0) + 1) % list.length;
      if (pressed.back && s.screen === "gameover") s = title(s);
      else if (confirm) {
        const index = s.menuIndex ?? 0;
        if (s.screen === "title") {
          s.titleIndex = index;
          if (index === 0) s = begin(s);
          else screen(s, "howto");
        } else if (s.screen === "paused") {
          if (index === 0) screen(s, "playing");
          else if (index === 1) s = begin(s);
          else s = title(s);
        } else if (s.screen === "gameover")
          s = index === 0 ? begin(s) : title(s);
      }
    }
    // The newest request wins while several directions are held; keep it buffered.
    const directions: Direction[] = ["up", "down", "left", "right"];
    const heldDirections = directions.filter((d) => api.input.value(d) > 0);
    const newDirection = heldDirections.find((d) => pressed[d]);
    const held =
      newDirection ??
      (heldDirections.includes(s.desired)
        ? s.desired
        : (heldDirections[0] ?? null));
    s.remainder += dt;
    while (s.remainder + 1e-10 >= C.TICK_DT) {
      s.remainder -= C.TICK_DT;
      s = tick(s, held, emit);
    }
    return reconcile(s);
  },
  render,
};
