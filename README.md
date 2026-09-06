# Fatal Instinct Sprite Walker (V29)

A 2.5D sprite animation studio: trace a character rig from a PNG, generate an
8-frame walk cycle, run it through a walk-cycle correction pipeline, preview
bone mapping + IK on an imported GLB/GLTF/FBX model, and export sprite sheets
or modern GLB rigs.

This repo is a cleaned-up, multi-file split of an original single 12,600-line
`index.html`. See **"What changed"** below for the specifics.

## Project structure

```
index.html            entry point / markup
css/styles.css         all styles
js/app-core.js         sprite tracer, rig editor, pose timeline, walk-cycle
                        correction pipeline, sprite sheet + JSON export
js/wasm-runtime.js      browser WASM motion-correction engine wrapper
js/fi25d-engine.js      three.js 2.5D bone-mapping + IK viewer
js/version.js           single source of truth for the app version string
assets/motion-core.wasm compiled C++ motion-correction module
```

Dependency graph is one-directional:
`wasm-runtime.js` ← `app-core.js` ← `fi25d-engine.js`
(`fi25d-engine.js` reaches the sprite tracer through `window.FIProgressiveSketch`,
the app's own existing bridge object, rather than a direct import — see comments
in that file.)

## Running it

This uses native ES modules (`<script type="module">`) and `fetch()` to load
the WASM asset, both of which **require a real HTTP server** — opening
`index.html` directly via `file://` will fail silently (CORS blocks module
imports and fetches from `file://` origins).

Any static file server works. From this directory:

```bash
# Option A: no install needed
python3 -m http.server 8000

# Option B: via npm
npm start
```

Then open `http://localhost:8000`.

Three.js and its loaders/exporters, plus JSZip, load from CDN
(`cdn.jsdelivr.net`) — you'll need internet access the first time (browser
will cache after that).

## What changed from the original single-file version

**Fixed — 2.5D viewer never ran.** The bone-mapping/IK viewer
(`fi25dInit()` and friends) lived in a classic `<script>` tag that called
`THREE.Scene()`, `FBXLoader`, `GLTFLoader`, and `GLTFExporter` without ever
importing them — those were only imported inside a *different*,
`type="module"` script, and ES module bindings never leak into classic
scripts. This threw `ReferenceError: THREE is not defined` the instant the
page loaded, so the whole viewer silently never initialized. It's now its
own real ES module (`js/fi25d-engine.js`) with its own imports.

**Fixed — silent no-ops between modules.** The same code reached into the
sprite-tracer's internal state (`fiSketchState`, `fiSketchDraw`, etc.)
through `try { … } catch(_) {}` and optional chaining, which quietly
swallowed the same scope error on every call — the frame preview and combat
metadata export never actually synced with the sprite tracer. Rewired
through `window.FIProgressiveSketch`, the app's own existing bridge object
for that module (it already exposed `.state`; three more entries —
`.draw`, `.characterKey`, `.cycleAudit` — were added to it, following the
same pattern already used elsewhere in the codebase).

**Fixed — dead status-badge initializer.** The JSZip `<script src="...">`
tag had inline JS packed inside its opening/closing tags. Per the HTML
spec, a `<script>` with a `src` attribute ignores its inline text entirely,
so a small "Safe Boot ready" status initializer never ran. It's now a
separate `<script>` tag (in `index.html`) and actually executes.

**Removed — 17 confirmed-dead functions.** Before deleting anything, each
candidate was checked via a full AST parse (not just text search) to
confirm it had zero references anywhere in the project — no callers, no
event handler wiring, no dynamic/string-based dispatch. The full list is in
the header comment of `js/app-core.js`. Nothing else was touched; the
~150+ other versioned walk-cycle-correction functions (`v20`–`v256…`) are
all actually reachable from the app's init/event-handler paths and were
left exactly as they were.

**Changed — WASM module is now a real binary asset.** The compiled C++
motion-correction module used to be inlined as a ~15KB base64 string
directly inside a `<script>` tag. It's now `assets/motion-core.wasm`,
decoded once and verified byte-for-byte against the original inline blob,
fetched at boot time. Same module, readable diffs, and a real asset git can
track sensibly instead of one enormous unreadable string.

**Not changed:** the walk-cycle correction pipeline itself (the `v20`
through `v256…` functions doing pose scoring/correction), the sprite
tracing/rig UI, the SNES export pipeline, and the WASM module's own
internal logic are all untouched — only how the files are organized and
wired together.

## V29 gait update — stronger weight transfer, knee lift, hip rotation, arm swing

The walk cycle previously read as the character being *repositioned* frame to
frame rather than genuinely stepping. Tracing the correction pipeline found
why:

- The corrective system is a **scoring optimizer** — each pass targets
  whichever motion channel (weight, torso, arms, stride, feet, heel-to-toe)
  currently scores *worst*, and freezes a channel permanently once it crosses
  a 92% quality threshold. Arm swing and foot/knee lift often score
  acceptably even when they look subtle, so **they could go untouched for the
  entire correction run** — the code existed but the optimizer had no reason
  to ever call it.
- Hip **translation** existed but was tiny (~1% of leg length at default
  settings). Hip **rotation** didn't exist at all — only sideways pelvis
  slide, no actual pelvis rotation.
- There was no dedicated knee-lift mechanism. The knee's height is a pure
  side-effect of two-bone IK between the hip and ankle (`v243CircleKnee`), so
  raising the ankle a little (the only thing the old code did) barely bends
  the knee at all.

Changes made (all in `js/app-core.js`, search for `V29:` comments):

1. **`v256HierarchicalSolve`** now unconditionally runs arm-opposition and
   swing-foot/knee-lift on every full ("all") solve, instead of only when
   the optimizer happens to pick them as that pass's single weakest metric.
2. **`v253ApplySwingFoot`** now actually shortens the swing leg's
   hip-to-ankle reach during High Step / Passing (not just lifting the
   ankle), which forces the existing IK solve to bend the knee further —
   genuine knee drive instead of a toe graze.
3. **New `v257ApplyHipRotation`**, called from `v253ApplyPhasePelvis`: tilts
   the hip line (swing-side hip leads and lifts slightly, support-side hip
   trails and drops) for real pelvis rotation, on top of translation.
4. Amplitude increases: pelvis translation (0.05→0.16 of the profile's
   `pelvisShift`), arm-opposition reach (0.10→0.17), and the
   "Weight-transfer target" slider default (5%→10% leg, range widened to
   16%) in `index.html`.

Planted-foot locking was already working correctly (multiple layers:
`v253ApplyWorldFootLock`, `v255ApplyPersistentContact`, `v254HardLockSupport`,
`v2562ApplyFinalFootLock`, all enabled by default) — no changes needed there.

**One caveat:** if a frame has a manually-approved pose from the sketch/trace
tool (`window.FIProgressiveSketch.getApprovedPose`), `buildPose` uses that
pose directly and skips this entire correction pipeline. These changes only
affect algorithmically-generated frames, not hand-approved ones.

If the motion still doesn't feel strong enough after this: the "fatal" /
"technical" / "heavy" / "arcade" presets in `V25_PROFILES` (search for that
name) drive `pelvisShift`, `armSwing`, `heelToe`, etc. as multipliers on top
of everything above — bumping those per-preset numbers is the next lever,
and it's isolated from the mechanics changes above.

## V29.1 — foot-lock fix, deliberate knee lift, controller test, twist w/ yaw guard

**Fixed — residual "skating" during planted-foot contact.** The support
ankle was genuinely locked to a fixed world point every frame, but nothing
re-solved the knee afterward -- so the knee stayed positioned against
whatever ankle location existed a step earlier in the pipeline, leaving the
hip-knee-ankle segment lengths slightly wrong. That small elastic "give,"
repeated every frame while the pelvis travels, read as skating even with a
technically-locked foot. `v2562ApplyFinalFootLock` in `js/app-core.js` now
re-solves the knee (via the existing `v243CircleKnee` geometry) immediately
after the final ankle/toe snap, so the leg is always geometrically exact
against the truly-final locked ankle.

**Stronger, more deliberate swing-leg knee lift.** `v253ApplySwingFoot`'s
reach-shortening (added in the V29 gait update, see below) is now
noticeably more pronounced during High Step: vertical lift 0.09→0.12 of
leg length, reach-shrink 0.16→0.24; Passing phase scaled up to match.

**New — controller test milestone** (`js/fi25d-engine.js`): hold ←/→ to
move `FI25D.root` and auto-play the 8-frame walk cycle; release to return
to Idle (a genuine neutral stance via bind pose / proxy rest pose, not just
holding frame 0). Facing direction mirrors the root via scale, never
rotation. This is the first real "playable" input path into the 2.5D
engine, distinct from the manual scrubbing/preview controls.

**New — controlled pelvis/torso twist, with an explicit yaw guard.** Both
`fi25dApplyImportedWalk` and `fi25dPoseProxy` now apply a small twist to
the hips/spine (or hips/torso mesh, for the proxy) for visual weight and
power. This is deliberately implemented as a **local rotation on those
bones/meshes only, via the same bind-relative helper used for every limb**
(`fi25dRotateFromBind`) — it is never applied to `FI25D.root` or the
camera. A rotation on the root or camera would yaw the whole fighter's
silhouette away from the fixed side-on camera; a contained twist on
hips/spine can't do that regardless of magnitude. If you extend this
further, keep that boundary: gait-driven rotation stays on individual
bones, root only ever gets position + mirror-scale changes.

## V29.3 — real IK retargeting, single locomotion state, touch, arena bounds

**The big one: the 3D viewer now actually reads Sprite Walker's corrected
pose data**, instead of maintaining a second, separate, hardcoded walk
animation. Previously `fi25dApplyImportedWalk` in `js/fi25d-engine.js`
drove Duroc's bones from fixed 8-entry arrays (`leg=[-.34,-.18,...]` etc.)
that had no connection to the V29 gait correction pipeline in
`js/app-core.js` — so improving Sprite Walker's gait had no effect on the
GLB. That's fixed:

- `js/app-core.js`'s `window.FIProgressiveSketch` bridge now exposes
  `getPose(frame)` (calls `buildPose()`, the same function that renders
  the 2D pose review) and `legScale()` (the sprite's own leg length in
  pixel units, for scaling onto a rig of different proportions).
- `js/fi25d-engine.js` has a new `fi25dRetargetFromSpriteWalker(frame)`
  that pulls that corrected pose and solves **real two-bone positional
  IK** for each leg and arm: desired ankle/wrist position (from Sprite
  Walker) → hip/shoulder-relative target → law-of-cosines knee/elbow
  solve (same math as `v243CircleKnee` in app-core.js, just done in 3D
  world space) → bone quaternions via `fi25dAimBoneWorld`, which rotates
  each bone's bind-relative direction to the solved direction correctly
  in its *parent's current* space (so it composes correctly with hip
  drop, pelvis twist, and the facing-mirror on the root, instead of
  assuming a fixed axis convention).
- Foot orientation now comes from the sprite's actual ankle→toe vector,
  not a planted/lifted guess.
- The old hardcoded arrays are kept as `fi25dApplyImportedWalkFallback`,
  used **only** when Sprite Walker doesn't have usable pose data yet (no
  reference image traced) — so the viewer still works standalone, and
  upgrades to real retargeting automatically once Sprite Walker data
  exists. Same pattern applied to the proxy rig
  (`fi25dRetargetProxyFromSpriteWalker` / `fi25dPoseProxyFallback`), which
  repositions its cylinder meshes directly rather than aiming bones.
- Assumption worth knowing: standard humanoid bone hierarchy (lowerLeg's
  parent is upperLeg, etc.) — true for Mixamo and most humanoid GLTF/FBX
  exports. A chain with an unusual hierarchy is skipped gracefully per
  limb rather than crashing.

**"IK READY" is now closer to true.** The retargeting above **is** the
desired-position → hip/knee-solve → foot-orientation pipeline described in
the badge. Two honest caveats: (1) it currently assumes the leg/arm stay
within the character's own sagittal (X-Y) plane, matching a 2.5D side-view
game — no out-of-plane (Z) reach; (2) the perpendicular bend-side is
chosen by comparing to the bind pose's own bend direction, which works
well for a normal humanoid rest pose but could pick the wrong side on a
very unusual bind pose (crossed legs, etc.).

**Fixed — the timer conflict.** `FI25D.playTimer` (manual Play button) and
`FI25D.player.walkTimer` (controller) were two independent intervals that
could both be advancing frames at once, and releasing the controller only
cleared its own timer, not a manual Play run. Replaced with one
`FI25D.locomotion` state machine (`{mode, source, timer}`) — the Play
button, keyboard, and touch controls all start/stop through the same
`fi25dStartWalking(source)` / `fi25dApplyIdle()`, so there is exactly one
timer, ever, and starting one input source cleanly takes over from
another.

**New — touch controls.** ◀ LEFT / RIGHT ▶ buttons render underneath the
viewport on narrow layouts (same breakpoint as the existing mobile CSS).
They feed the exact same `FI25D.player.held.left/right` state as the
keyboard, via pointer events (covers touch and mouse in one handler), so
touch, keyboard, and the manual Play button are three inputs into one
state machine, not three separate code paths.

**New — arena boundaries.** `FI25D.arena = {minX, maxX}` (±2.6, tunable)
now clamps `FI25D.root.position.x` every frame in
`fi25dUpdatePlayerMovement`, so Duroc can't walk out of the visible floor
(8 units wide) or off-camera. A camera-follow system is the natural next
step if the arena needs to be wider than what fits in one fixed shot; this
clamp is the simpler fix for now.

## Version numbering

`js/version.js` exports `FI_APP_VERSION`, the single source of truth for
the version shown in the page title, header badge, in-app status messages,
and exported filenames (`index.html` has a small inline module script that
syncs the title/badge from it at load). `package.json`'s `version` field
is kept in sync manually (npm doesn't read JS at install time) — bump both
together. The one exception is the `schema:'fatal-instinct-2.5d/v2'` string
in `fi25dExportMeta`'s combat-metadata JSON — that's a **data format**
version (for external tools reading the exported JSON), not the app build
number, and intentionally doesn't move in lockstep with `FI_APP_VERSION`.

## Continuing the animation work

- The walk-cycle correction pipeline (search `js/app-core.js` for
  `v25Motion`, `v23`, `v256HierarchicalSolve`, etc.) is the "Adaptive Motion
  Intelligence" system driving pose correction across passes — that's
  probably your main entry point for tuning gait quality.
- The 2.5D viewer's proxy rig and bone-alias table are in
  `js/fi25d-engine.js` (`fi25dBuildProxy`, `FI25D_BONE_ALIASES`) if you want
  to adjust auto-mapping for a different skeleton naming convention (e.g.
  a non-Mixamo rig).
- `js/wasm-runtime.js` is a thin wrapper; the actual correction math runs
  inside `assets/motion-core.wasm` (compiled from C++ — source not included
  here, only the compiled module).
