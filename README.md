# Fathom

A bioluminescent deep-sea maze chase. Graze every plankton mote, descend to the
next depth, and survive three hunters that track light, sound, and the flash of
a flare. Eating expands your vision circle and makes you easier to find. Terrain
stays remembered, but even explored corridors disappear beyond your circle.

Install with `npm ci`, then run `npm run dev` and open the local URL printed by
Vite. Everything runs in the browser; no account, service, or API key is needed.

Run `npm run build` to produce the complete static site in `dist/`.
`npm run preview` serves that build locally. Deploy the contents of `dist/` to
a static host at its root or under a sub-path; assets resolve relative to the page.

Controls:

- **WASD / arrows:** hold to swim; up/down selects menu items.
- **Space:** sonar. It reveals passages and hunters, but the Gloamfin hears it.
- **Shift:** ink. It blinds the hunters that see, for three seconds.
- **Enter / Space:** confirm a menu item.
- **Escape / P:** pause or resume. Escape also returns from the field guide.
- **M:** toggle sound.
- **Backtick:** show the engine's diagnostic overlay.
- **Pointer / touch:** select and activate menus. Touch also shows the engine's
  movement pad and action buttons.

You begin with three lives in reserve, in addition to the current attempt.
A catch preserves your score, eaten plankton, and remembered terrain. Each depth
adds pressure: more predators, up to six, and a shorter sonar range.

`npm run typecheck`, `npm run lint`, `npm run format`, and `npm test` verify the
project. Tests exercise the simulation and the Simple 2D engine with native canvas,
scripted clocks, and actual input events. The debug surface is returned through
`engine.debug`; its pure poses and readings never install globals on the page.

The game holds state by value, advances at 120 fixed ticks per second, loads its
seeded pixel art through the engine, and synthesizes its seven audio cues locally.
The player-facing description and captured media are in `showcase/`.

To reproduce the showcase, start the development server and run
`node tools/capture.mjs` in a second terminal. It uses the public debug surface
and the engine recorder to capture a short live dive.
