import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  type ReadState,
  type Direction,
  type Predator,
  center,
  distance,
  distances,
  neighbor,
  choices,
  sight,
} from "./model";
import { items, menuItemRect } from "./debug";
export const BACKGROUND = "#03060c";
const BG = BACKGROUND,
  CYAN = "#8bf5ed",
  DIM = "#4c7b89",
  WHITE = "#d4eeea",
  AMBER = "#ff9a63";
type Context = CanvasRenderingContext2D;
function text(
  c: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = WHITE,
  align: CanvasTextAlign = "left",
) {
  c.font = `${size}px "SFMono-Regular", Consolas, "Liberation Mono", monospace`;
  c.fillStyle = color;
  c.textAlign = align;
  c.fillText(value, x, y);
}
function line(
  c: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#16303b",
) {
  c.strokeStyle = color;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x2, y2);
  c.stroke();
}
function disc(c: Context, x: number, y: number, r: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}
function glow(c: Context, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
function sprite(
  c: Context,
  s: ReadState,
  sheet: string,
  frame: number,
  x: number,
  y: number,
  size = C.TILE,
) {
  const img = s.assets[sheet]?.[frame];
  if (img) c.drawImage(img, x - size / 2, y - size / 2, size, size);
}
const pair = (dir: Direction) => ({ down: 0, up: 2, left: 4, right: 6 })[dir];
function terrain(
  c: Context,
  s: ReadState,
  x: number,
  y: number,
  force = false,
) {
  const vis = s.visibility[y][x];
  if (vis === "u" && !force) return;
  const tile = s.tiles[y][x];
  let frame = 16;
  if (tile === "#")
    frame =
      (s.tiles[y - 1]?.[x] === "#" ? 1 : 0) +
      (s.tiles[y]?.[x + 1] === "#" ? 2 : 0) +
      (s.tiles[y + 1]?.[x] === "#" ? 4 : 0) +
      (s.tiles[y]?.[x - 1] === "#" ? 8 : 0);
  else if (tile === "g") frame = 18;
  const p = center(x, y);
  c.globalAlpha = force || vis === "l" ? 1 : 0.24;
  sprite(c, s, "trench-walls", frame, p.x, p.y);
  if (s.plankton[y][x] === "*" && tile === ".") {
    c.shadowColor = CYAN;
    c.shadowBlur = 8;
    disc(
      c,
      p.x,
      p.y,
      C.PLANKTON_DOT / 2,
      vis === "l" || force ? "#b3ffda" : "#4a8c86",
    );
    c.shadowBlur = 0;
  }
  c.globalAlpha = 1;
}
function amber(c: Context, x: number, y: number) {
  glow(c, x, y, 21, "#ef78483d");
  disc(c, x, y, 3, AMBER);
  disc(c, x - 0.5, y - 0.5, 1, "#ffe3a4");
}
function maze(c: Context, s: ReadState) {
  c.fillStyle = BG;
  c.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  // Frame 17 is flat fog over every kind of terrain, including remembered
  // ground outside the Kindle circle. Only the clipped reveal pass replaces it.
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const p = center(x, y);
      sprite(c, s, "trench-walls", 17, p.x, p.y);
    }
  const f = s.forager;
  const flares = s.predators.filter((p) => p.flaring && p.state !== "den");
  c.save();
  c.beginPath();
  c.arc(f.x, f.y, s.windowRadius, 0, Math.PI * 2);
  for (const p of flares) {
    c.moveTo(p.x + C.FLARE_RADIUS, p.y);
    c.arc(p.x, p.y, C.FLARE_RADIUS, 0, Math.PI * 2);
  }
  c.clip();
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++)
      terrain(
        c,
        s,
        x,
        y,
        flares.some((p) => distance(p, center(x, y)) <= C.FLARE_RADIUS),
      );
  glow(c, f.x, f.y, s.windowRadius, "#4de8db0d");
  for (const d of s.drifters) {
    if (d.lit)
      sprite(c, s, "drifter", Math.floor(s.playTime * 8) % 8, d.x, d.y);
    amber(c, d.x, d.y);
  }
  for (const p of s.predators)
    if (p.kind === "lanternjaw" && p.state !== "den") amber(c, p.x, p.y);
  for (const cloud of s.inkClouds) {
    disc(c, cloud.x, cloud.y, cloud.radius, "#00040bf2");
    for (let i = 0; i < 7; i++)
      disc(
        c,
        cloud.x + Math.cos(i) * cloud.radius * 0.58,
        cloud.y + Math.sin(i) * cloud.radius * 0.58,
        cloud.radius * 0.4,
        "#00040b9a",
      );
  }
  c.restore();
  for (const pulse of s.pulses) {
    const map = distances(s, pulse.ox, pulse.oy, true);
    const color =
      pulse.tint === "cyan"
        ? CYAN
        : pulse.tint === "violet"
          ? "#bc8dff"
          : "#ff9b57";
    // The crest traverses graph edges, so its light rounds bends and forks at junctions.
    c.strokeStyle = color;
    c.lineCap = "round";
    c.lineWidth = 4;
    c.shadowColor = color;
    c.shadowBlur = 14;
    for (const [key, d] of map) {
      if (d > pulse.range || pulse.front < d || pulse.front - d > 1.9) continue;
      const [tx, ty] = key.split(",").map(Number);
      const a = center(tx, ty);
      for (const dir of choices(s, { tx, ty }, true)) {
        const n = neighbor(s, tx, ty, dir)!;
        if (map.get(`${n.tx},${n.ty}`) !== d + 1 || d + 1 > pulse.range)
          continue;
        const b = center(n.tx, n.ty);
        // The wrap edge is drawn at its two mouths rather than across the stage.
        const deltaX =
          Math.abs(b.x - a.x) > C.TILE
            ? dir === "left"
              ? -C.TILE
              : C.TILE
            : b.x - a.x;
        const deltaY = b.y - a.y;
        const lo = Math.max(0, Math.min(1, pulse.front - d - 0.75));
        const hi = Math.max(0, Math.min(1, pulse.front - d));
        if (hi <= lo) continue;
        c.beginPath();
        c.moveTo(a.x + deltaX * lo, a.y + deltaY * lo);
        c.lineTo(a.x + deltaX * hi, a.y + deltaY * hi);
        c.stroke();
      }
      const alpha = Math.max(0, 1 - Math.abs(pulse.front - d) / 1.4);
      c.globalAlpha = alpha;
      glow(c, a.x, a.y, 22, color + "28");
      c.globalAlpha = 1;
    }
    c.shadowBlur = 0;
    c.lineCap = "butt";
    c.globalAlpha = 1;
  }
  for (const p of s.predators) {
    if (p.state === "den") continue;
    if (p.lit) {
      const frame =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (Math.floor(s.playTime * 8) % 8)
          : pair(p.dir) + (Math.floor(s.playTime * 7) % 2);
      const ownLight = distance(p, f) <= s.visionRadius && sight(s, f, p);
      const inFlare = flares.some(
        (flare) => distance(p, flare) <= C.FLARE_RADIUS,
      );
      if (p.mark > 0 && !ownLight && !inFlare && !p.alert)
        c.globalAlpha = Math.min(1, p.mark / 0.5);
      sprite(c, s, p.kind, frame, p.x, p.y);
      c.globalAlpha = 1;
    }
    if (p.alert) {
      const color = p.kind === "gloamfin" ? "#c49bff" : "#ffb885";
      const t = 1 - p.alertLeft / C.ALERT_TIME;
      c.strokeStyle = color;
      c.lineWidth = 2;
      c.globalAlpha = 1 - t;
      c.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8,
          r = (i % 2 ? 12 : 25) + t * 22;
        const x = p.x + Math.cos(a) * r,
          y = p.y + Math.sin(a) * r;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.stroke();
      c.globalAlpha = 1;
    }
    if (p.kind === "flarefish" && p.flareAge >= 0) flare(c, s, p);
  }
  glow(c, f.x, f.y, 36, "#73ffe43c");
  sprite(
    c,
    s,
    "glimmerfin",
    pair(f.dir) + (f.moving ? Math.floor(s.playTime * 9) % 2 : 0),
    f.x,
    f.y,
  );
}
function flare(c: Context, s: ReadState, p: DeepReadonlyPredator) {
  let frame: number;
  if (p.flareAge < C.FLARE_CHARGE)
    frame = Math.min(2, Math.floor((p.flareAge / C.FLARE_CHARGE) * 3));
  else if (p.flareAge < C.FLARE_CHARGE + C.FLARE_BLOOM)
    frame =
      3 +
      Math.min(
        2,
        Math.floor(((p.flareAge - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3),
      );
  else
    frame =
      6 +
      Math.min(
        1,
        Math.floor(((p.flareAge - C.FLARE_CHARGE - C.FLARE_BLOOM) / 0.3) * 2),
      );
  sprite(c, s, "flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
}
type DeepReadonlyPredator = Readonly<Predator>;
function gauge(
  c: Context,
  label: string,
  x: number,
  cooldown: number,
  total: number,
  color: string,
) {
  text(c, label, x, 689, 13, cooldown === 0 ? color : DIM);
  text(
    c,
    cooldown === 0 ? "READY" : `${cooldown.toFixed(1)}s`,
    x + 195,
    689,
    13,
    cooldown === 0 ? color : DIM,
    "right",
  );
  c.fillStyle = "#11212c";
  c.fillRect(x, 701, 195, 3);
  c.fillStyle = color;
  c.fillRect(x, 701, 195 * Math.max(0, 1 - cooldown / total), 3);
}
function hud(c: Context, s: ReadState) {
  line(c, 64, 70, 1216, 70);
  line(c, 64, 664, 1216, 664);
  text(c, C.TITLE_TEXT, 64, 43, 22, CYAN);
  text(c, C.DIVE_LABEL, 191, 43, 11, DIM);
  text(c, String(s.score).padStart(6, "0"), 640, 54, 48, WHITE, "center");
  text(c, "PLANKTON", 1216, 28, 11, DIM, "right");
  text(
    c,
    String(s.planktonRemaining).padStart(3, "0"),
    1216,
    53,
    20,
    CYAN,
    "right",
  );
  text(c, `DEPTH ${s.depth}`, 64, 697, 17, CYAN);
  for (let i = 0; i < s.lives; i++)
    sprite(c, s, "glimmerfin", 6, 232 + i * 28, 692, 24);
  gauge(c, "[SPACE] SONAR", 457, s.sonar.cooldown, C.SONAR_COOLDOWN, CYAN);
  gauge(c, "[SHIFT] INK", 710, s.ink.cooldown, C.INK_COOLDOWN, "#bba5ed");
  text(
    c,
    s.muted ? "M / SOUND OFF" : "M / SOUND ON",
    1216,
    692,
    11,
    DIM,
    "right",
  );
  text(c, "P / PAUSE", 1216, 709, 10, DIM, "right");
}
function atmosphere(c: Context, s: ReadState) {
  for (let i = 0; i < 85; i++) {
    const x = (i * 173.71) % C.STAGE_W,
      y = (i * 97.33 - s.simTime * (2 + (i % 4)) + C.STAGE_H * 100) % C.STAGE_H;
    disc(c, x, y, i % 3 === 0 ? 1.3 : 0.7, i % 4 === 0 ? "#34717e" : "#18303a");
  }
  for (let i = 0; i < 4; i++) {
    c.strokeStyle = "#0d222c";
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(640, 328, 250 + i * 80, 160 + i * 52, 0, 0, Math.PI * 2);
    c.stroke();
  }
}
function titleScreen(c: Context, s: ReadState) {
  atmosphere(c, s);
  text(c, "ABYSSAL FIELD NOTES", 64, 53, 12, DIM);
  text(c, "01 / KINDLE", 1216, 53, 12, DIM, "right");
  line(c, 64, 70, 1216, 70);
  // A dim archipelago of trench walls frames the menu without disclosing the dive.
  c.save();
  c.globalAlpha = 0.15;
  for (let y = 3; y < 15; y++)
    for (let x = 2; x < 34; x++) {
      const p = center(x, y);
      if ((x < 11 || x > 24) && s.tiles[y][x] === "#")
        sprite(c, s, "trench-walls", 5, p.x, p.y);
    }
  c.restore();
  glow(c, 640, 255, 280, "#20b4b419");
  c.strokeStyle = "#467e80";
  c.lineWidth = 1;
  c.beginPath();
  c.arc(640, 174, 44, 0, Math.PI * 2);
  c.stroke();
  c.beginPath();
  c.arc(640, 174, 63, -0.8, 2.1);
  c.stroke();
  sprite(c, s, "glimmerfin", 6 + (Math.floor(s.simTime * 2) % 2), 640, 174, 48);
  text(c, C.TITLE_TEXT, 640, 330, 110, "#b5fff1", "center");
  text(
    c,
    C.TAGLINE_TEXT.split("").join(" "),
    640,
    370,
    15,
    "#66a5ab",
    "center",
  );
  text(c, "A LIGHT IN THE TRENCH.", 100, 493, 12, CYAN);
  text(c, "Feed. Glow. Be found.", 100, 519, 12, DIM);
  text(c, "TRUST NO AMBER LIGHT.", 1180, 493, 12, AMBER, "right");
  text(c, "Something is listening.", 1180, 519, 12, DIM, "right");
  line(c, 64, 638, 1216, 638);
  text(c, "WASD / ARROWS   SWIM", 64, 677, 12, DIM);
  text(c, "SPACE   SONAR     SHIFT   INK", 640, 677, 12, DIM, "center");
  text(c, "ENTER   DESCEND", 1216, 677, 12, CYAN, "right");
  text(c, "A BIOLUMINESCENT MAZE CHASE", 640, 709, 10, "#31515e", "center");
}
function menu(c: Context, s: ReadState) {
  for (const [i, label] of items(s).entries()) {
    const r = menuItemRect(s, i)!;
    const active = i === s.menuIndex;
    c.fillStyle = active ? "#102d37" : "#06131d";
    c.fillRect(r.x, r.y, r.w, r.h);
    c.strokeStyle = active ? "#72ded3" : "#18313d";
    c.lineWidth = 1;
    c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (active) {
      c.fillStyle = CYAN;
      c.fillRect(r.x, r.y, 3, r.h);
      text(c, "›", r.x + 22, r.y + 31, 24, CYAN);
    }
    text(c, label, r.x + r.w / 2, r.y + 30, 16, active ? CYAN : DIM, "center");
  }
}
function howto(c: Context, s: ReadState) {
  atmosphere(c, s);
  text(c, "FIELD GUIDE / 01", 80, 75, 12, DIM);
  text(c, "LEARN THE DARK", 80, 135, 42, CYAN);
  text(
    c,
    "Eat every plankton mote to descend. Every meal makes you brighter — and easier to find.",
    80,
    178,
    14,
    WHITE,
  );
  line(c, 80, 211, 1200, 211);
  const cards = [
    {
      x: 80,
      sheet: "lanternjaw",
      frame: 1,
      name: "LANTERNJAW",
      tag: "HUNTS YOUR LIGHT",
      copy: ["An amber glow could be food.", "Or jaws. Sonar cannot tell."],
    },
    {
      x: 470,
      sheet: "gloamfin",
      frame: 7,
      name: "GLOAMFIN",
      tag: "HUNTS YOUR SOUND",
      copy: [
        "Violet pings sweep the corridors.",
        "Your own sonar gives you away.",
      ],
    },
    {
      x: 860,
      sheet: "flarefish",
      frame: 7,
      name: "FLAREFISH",
      tag: "HUNTS BY FLASH",
      copy: [
        "A warm charge warns of a bloom.",
        "It sees through rock in the flash.",
      ],
    },
  ];
  for (const card of cards) {
    sprite(c, s, card.sheet, card.frame, card.x + 24, 263, 48);
    text(c, card.name, card.x + 65, 253, 18, CYAN);
    text(c, card.tag, card.x + 65, 277, 11, DIM);
    card.copy.forEach((v, i) => text(c, v, card.x, 327 + i * 25, 13, WHITE));
  }
  line(c, 80, 394, 1200, 394);
  const controls = [
    ["WASD / ARROWS", "Hold to swim. Buffer turns at junctions."],
    ["SPACE / SONAR", "Reveal winding passages. Beware the listener."],
    ["SHIFT / INK", "Blind light hunters. Sound passes through."],
    ["P / ESC / M", "Pause your dive / toggle sound."],
  ];
  controls.forEach(([key, copy], i) => {
    text(c, key, 80, 443 + i * 39, 14, CYAN);
    text(c, copy, 320, 443 + i * 39, 14, WHITE);
  });
  text(
    c,
    "Your light reveals the maze. Explored ground stays in memory, but outside your circle is dark.",
    80,
    626,
    13,
    DIM,
  );
  text(c, "ENTER / ESC / TAP ANYWHERE TO RETURN", 640, 684, 13, CYAN, "center");
}
export function render(s: ReadState, api: RenderApi) {
  const c = api.ctx;
  c.imageSmoothingEnabled = false;
  c.fillStyle = BG;
  c.fillRect(0, 0, C.STAGE_W, C.STAGE_H);
  if (s.screen === "title") {
    titleScreen(c, s);
    menu(c, s);
    return;
  }
  if (s.screen === "howto") {
    howto(c, s);
    return;
  }
  if (s.screen === "gameover") {
    atmosphere(c, s);
    text(c, "SIGNAL LOST", 640, 245, 64, AMBER, "center");
    text(
      c,
      `DEPTH ${s.depth}   /   ${String(s.score).padStart(6, "0")} POINTS`,
      640,
      313,
      20,
      WHITE,
      "center",
    );
    text(c, "The trench keeps its secrets.", 640, 354, 14, DIM, "center");
    menu(c, s);
    return;
  }
  maze(c, s);
  hud(c, s);
  if (s.screen === "paused") {
    c.fillStyle = "#02080ed9";
    c.fillRect(340, 190, 600, 450);
    text(c, "HOLDING BREATH", 640, 299, 34, CYAN, "center");
    text(c, "THE TRENCH CAN WAIT", 640, 340, 12, DIM, "center");
    menu(c, s);
  }
  if (s.screen === "countdown" || s.screen === "cleared") {
    c.fillStyle = "#02080ec9";
    c.fillRect(365, 245, 550, 220);
    text(
      c,
      s.screen === "cleared" ? `DEPTH ${s.depth} CLEARED` : C.TITLE_ITEMS[0],
      640,
      327,
      36,
      CYAN,
      "center",
    );
    text(
      c,
      s.screen === "cleared"
        ? `+${C.SCORE_CLEAR}  /  DESCENDING`
        : String(Math.max(1, Math.ceil(2 - s.screenTime))),
      640,
      391,
      40,
      WHITE,
      "center",
    );
  }
}
