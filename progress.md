Original prompt: gere o threejs desse carro, o mais detalhista possivel.

## Track visuals, GLB scenery and two-way traffic

- Replaced the palm and building placeholder boxes with the supplied `Palmeira.glb` and `Building.glb`, copied into `public/assets/` as `palm.glb` and `building.glb` and loaded through `GLTFLoader` without blocking startup.
- Palms keep their authored material and texture; they read as near-black silhouettes because they sit on their own render layer lit by a single dim hemisphere light, not because the material was darkened. The export's `transmissionFactor: 1` is zeroed, which would otherwise have rendered the fronds as invisible glass.
- Buildings merge their 13 primitives into one geometry (1 draw call each), take an independent material per instance, alternate through a five-colour tint, and stretch 1x-3x vertically in five tiers.
- Moved the skyline out from x 23-38 to x 48-76 so it reads as distant, and widened the shoulder plane to 220 units so the ground still reaches it.
- Added a warm sunset `DirectionalLight` confined to the skyline layer, with shadow casting, so buildings pick up a specular edge and shade their own far faces without washing out the road or the car.
- Removed the `frontBeam` spotlight that ran down the centre of the track, and its line in `setLights`.
- Deleted `createCheckerFloorTexture`: the track is now a matte dark surface carrying only neon pink markings. Both side lines changed from cyan to `PINK`, and the centre dash from pale pink to the same neon pink. No blue remains on the track.
- Traffic now seeds eight cars across the whole corridor the moment a race starts, and 45% of later spawns enter from behind the camera and overtake. Spawns inside the safe zone are filtered to lanes clear of the player's collision band, so nothing can appear on top of the car at the start.
- Found and fixed a pre-existing cost: the car's glass and headlight lenses carried `transmission`, which forced three.js to render the entire opaque scene a second time every frame. Removing it (the tinted near-black glass looks identical) cut the frame from 863 draw calls / 5.4M triangles to 504 / 3.0M.
- Measured in the same software renderer, the scene now runs about 0.9 fps against the original 0.5 fps, so the detailed GLB scenery costs less than the duplicate pass it replaced.
- Browser verification over a 66-second race: eight cars seeded at T+0.1s (six ahead, two behind), zero same-lane spawns inside the safe zone, one to three cars overtaking from behind at any time, and a clean console.
- Production build and all four Sites tests pass.
- TODO: none for this request.

## 2026-08-27

- Reduced the rear license plate to 50% in both dimensions and raised it slightly to clear the exhausts.
- Added a four-pipe backfire effect with layered flame cones, sparks, and dynamic orange light.
- Backfire triggers when wheel spin starts and from a dedicated Escape control.
- Added deterministic `advanceTime` and concise `render_game_to_text` hooks for interaction testing.
- Initial browser pass confirmed the automatic trigger, but the 0.52 s effect was too easy to miss under heavier WebGL frames; extended the still-brief burst to 0.9 s for reliable visual feedback.
- Final GPU-browser review confirmed the 50% plate clears all four exhaust tips; the backfire envelope lasts 2.4 s so the layered flame remains legible even at lower WebGL frame rates.
- Verified the automatic wheel-start trigger with the prescribed Playwright client and visually inspected the rear view in the GPU-backed in-app browser; no console errors were reported.
- Production build and all four Sites tests pass. Updated ZIP integrity check passes.
- TODO: none for this request.

## Compact wheel arches

- Reduced the visible outer wheel-arch radius by approximately 30% and brought the inner edge close to the tire while preserving a 0.027-unit static clearance.
- Refit the neon brow and wheel-well mask to the compact radius.
- Final side-profile inspection confirms the arc is visibly about 30% smaller, sits close to each tire, and leaves the tire silhouette unobstructed; browser console has no warnings or errors.
- Production build and all four Sites tests pass; refreshed ZIP passes integrity validation.
- TODO: none for this request.

## Rear indicators, width, and floor glow

- Removed the separate front/rear amber indicator bars and integrated six sequential segments into each existing rear lamp cluster.
- Increased wheel axial width by 70% across tires, sidewalls, rims, hubs, holes, and tread blocks.
- Increased wheel-arch band radius and extrusion depth by 80%.
- Detached the red underglow from the moving car, lowered it to the floor, and expanded it to 5.8 × 9.4 units so it extends beyond the widened tires.
- Visual review confirms the sequential amber state occupies the existing rear lamp cluster, widened wheels and 80%-thicker arches render on all four corners, and the red floor stays fixed while the car is airborne.
- Red floor coverage extends beyond both outer tire edges in the rear view; browser console has no warnings or errors.
- Production build and all four Sites tests pass; refreshed ZIP passes integrity validation.
- TODO: none for this request.

## Wheel-arch correction

- Removed the four solid fender wedges that intersected the tires.
- Added four extruded body panels with real open semicircular cutouts, 0.062 units of radial tire clearance, dark inner wheel wells, and matching edge highlights.
- Resized and repositioned the four arch brow tubes to follow the new tire clearance.
- First visual pass showed the cutouts worked but the surrounding panels were too tall and rectangular; refined them into low crescent-shaped fender flares that follow only the upper tire contour.
- Increased radial clearance to 0.157 units, exceeding the maximum 0.136-unit suspension compression so the body cannot intersect the tires during the landing animation.
- Final side-view inspection confirms all four tire silhouettes remain unobstructed, with clearance maintained through the configured suspension travel.
- Production build and all four Sites tests pass; browser console has no warnings or errors.
- TODO: none for this request.

## Turn signals and suspension

- Added six-stage sequential amber indicators to the front and rear of both sides, flowing from center to outside.
- Added independent left/right controls and matching state in `render_game_to_text`.
- Corrected wheel center height to account for tread depth, eliminating floor clipping.
- Added a drop test with gravity, impact detection, damped body oscillation, and wheel compensation to keep tire contact during suspension travel.
- Verified left/right exclusivity, sequential center-to-edge illumination, airborne drop state, damped landing, and final tire contact in the GPU-backed browser.
- Browser console contains no warnings or errors.
- Production build and all four Sites tests pass; refreshed deliverable ZIP passes integrity validation.
- TODO: none for this request.
