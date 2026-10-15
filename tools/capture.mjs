/* global document, KeyboardEvent, console */
// Run against `npm run dev` to reproduce the showcase through the public engine API.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { Buffer } from "node:buffer";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
await page.goto("http://localhost:5173/");
await page.waitForTimeout(1500);
const capture = await page.evaluate(async () => {
  const { createEngine, ConstantClock } =
    await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
  const { game, BACKGROUND } = await import("/src/game.ts");
  const canvas = document.createElement("canvas");
  canvas.id = "stage";
  document.getElementById("stage").replaceWith(canvas);
  const engine = createEngine({
    canvas,
    game,
    background: BACKGROUND,
    width: 1280,
    height: 720,
    clock: new ConstantClock(1000 / 60),
    layout: "dpad-4-two-buttons",
  });
  await engine.initialize();
  await engine.advance(1);
  const title = canvas.toDataURL("image/png");
  const d = engine.debug;
  engine.apply((s) => d.setScreen(s, "playing"));
  engine.apply((s) => d.clearPredators(s));
  engine.apply((s) => d.setForagerTile(s, 13, 11));
  engine.apply((s) => d.addPredator(s, "flarefish", 24, 9));
  engine.apply((s) => d.setPredatorTravel(s, 0, false));
  await engine.advance(420);
  engine.apply((s) => d.setBrightness(s, 1));
  engine.apply((s) => d.setBrightHold(s, 1));
  engine.apply((s) => d.addPredator(s, "lanternjaw", 9, 11));
  engine.apply((s) => d.addPredator(s, "gloamfin", 9, 13));
  engine.apply((s) => d.spawnDrifter(s, 15, 13));
  const key = (code, down) =>
    document.dispatchEvent(
      new KeyboardEvent(down ? "keydown" : "keyup", { code }),
    );
  key("ArrowRight", true);
  engine.startRecording();
  let kindle;
  for (let frame = 0; frame < 180; frame++) {
    if (frame === 20 || frame === 120) key("Space", true);
    if (frame === 21 || frame === 121) key("Space", false);
    await engine.advance(1);
    if (frame === 45) kindle = canvas.toDataURL("image/png");
  }
  key("ArrowRight", false);
  const recording = engine.stopRecording();
  const result = {
    title,
    kindle,
    recording: JSON.stringify(recording),
    frames: recording.frames.length,
    finalScreen: engine.state.screen,
  };
  engine.destroy();
  return result;
});
await mkdir("showcase", { recursive: true });
for (const name of ["title", "kindle"])
  await writeFile(
    `showcase/${name}.png`,
    Buffer.from(capture[name].split(",")[1], "base64"),
  );
await writeFile("showcase/dive.json.gz", gzipSync(capture.recording));
console.log(
  `Captured ${capture.frames} frames; ended on ${capture.finalScreen}.`,
);
await browser.close();
