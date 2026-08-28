# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Prototype Decisions

- Keep the car body closed and static: no door-opening controls, door mechanisms, handles, or door-specific inset pieces.
- Use the third vehicle action for a visible wheel-spin toggle with explicit stopped/running labels.
- Keep all four wheels free of colored brake-caliper blocks.
- Do not add rectangular side-door panels, side-window overlays, lower window trims, or rear side-window meshes; the clean central body and pillars define the silhouette.
- Keep both mirrors free-standing visually; do not add square tube/stem geometry beside them.
- Do not add separate rectangular A-pillar meshes beside the mirrors; the windshield geometry should define its own front edge.
- Keep the rear license plate at half its original width and height so it stays clear of the exhausts.
- Strong acceleration (starting wheel spin) and a dedicated Escape button both trigger a brief four-pipe backfire effect.
- Integrate sequential amber turn signals into the existing rear lamp clusters; do not use separate indicator bars. Six lamp segments illuminate from the vehicle center toward the selected outer side.
- Tires must meet the floor without visibly clipping through it; suspension demonstrations keep the wheels planted while the body compresses and rebounds.
- Wheel arches must be true open cutouts sized to the current tires; never cover the tire silhouette with solid fender wedges.
- Keep wheels 70% wider than the initial design and wheel-arch bands/depth 80% thicker than their initial corrected form.
- The red underglow belongs on the fixed floor, must extend beyond the outside edges of all tires, and must never rise or fall with the car.
- Keep the latest compact wheel-arch radius (30% smaller outer radius) as the current visual direction, with the inner edge still outside the tire radius.
- The track is a neon pink grid on a near-black surface: scrolling transverse rungs plus fixed longitudinal rails at the same pitch, so the cells are square. No fill pattern, no centre dash, no edge lines, and nothing on the track is blue.
- No light runs down the centre of the track.
- Roadside palms use `public/assets/palm.glb` and must render as flat black silhouettes. The runtime clone swaps in an unlit black material that keeps only the original map's alpha, so the fronds stay cut out. The GLB on disk is never modified.
- Skyline buildings use `public/assets/building.glb`, sit far out to the sides to read as distant, stretch between 1x and 3x vertically, and alternate tint colours. They are the only scenery the sunset `DirectionalLight` touches.
- Traffic populates the road from the moment a race starts and arrives from behind the player as well as ahead. No car may ever spawn within the player's collision band while it is close enough to be unavoidable.
- Traffic never dodges the player. It queues behind and overtakes other traffic, but avoiding a collision is the driver's job — the car in front must always be reachable. Traffic also tops out well below the player's maximum, so it can be caught.
- Lane positions, traffic bodies and their collision extents all scale with `taperAt(z)`. A car must stay the same size relative to the road it is on, otherwise the converging far lanes are narrower than the cars and overlap becomes unavoidable.
- Keys 1-5 select a gear directly and pull speed into that gear's band; space fires the neon cannon. A struck car is thrown into a spinning ballistic arc off the track, clearing the lane.
- Settings expose music and sound-effect volume on separate buses. The soundtrack is `public/assets/game-sfx.mp3` played through a looping media element; every other effect is synthesised in `src/audio.js`.
- The start button uses the bundled `Game Over` face (`src/game-over.otf`), white and bold, at 2.5x its original size.
- Keep car materials free of `transmission`: any non-zero value makes three.js render the whole opaque scene a second time per frame.
- Cars are impenetrable. Contacts resolve on the axis of least penetration: side-swipes throw both bodies apart laterally, rear-enders hand closing speed forward. Traffic must never spawn on a spot another car already occupies.
- The sides of the world stay filled with buildings: a detailed GLB ring near the road, and merged box LODs beyond it. Only place columns inside the camera's horizontal cone, otherwise the geometry can never be seen.
- White speed streaks appear only at max speed.
- Camera settings expose focus distance, angle and height at centimetre/tenth-degree resolution.
