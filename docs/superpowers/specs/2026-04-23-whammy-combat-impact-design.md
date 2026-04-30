# Whammy Combat Overhaul — Armor Tiers & Terminal Impact Effects

## Goal

Replace the current "big blocky raiders on a straight line" look with smaller, sharper, physics-driven warriors that actually *fight*: their discs and mortars leave visible damage on the terminal for as long as Claude is busy, then heal away cleanly when `busy` clears.

Only the `tribes2` kit is affected. The `whammies` kit keeps its current behavior.

## Scope

In scope:
- Three distinct armor tiers (Light / Medium / Heavy), each with a unique silhouette, weapon, and impact style.
- Physics-based ski-arc motion across the terminal with jetpack bursts and body tilt.
- A new damage-overlay system layered on top of the xterm canvas that renders impact effects without touching the terminal buffer.
- Heal animation that fades damage out when the scope's `busy` flag goes false.

Out of scope:
- Any change to the xterm buffer or PTY layer. The real terminal text is never modified.
- Sound design changes beyond reusing the existing `spawn` / `complete` SFX hooks.
- Collision detection between warriors themselves (they just pass each other; combat is implied by firing, not by precise hit-testing).
- Changes to the Classic Whammies kit.

## Visual Design (locked via brainstorm)

### Warriors

| Tier | Size | Silhouette | Weapon | Cadence |
|------|------|------------|--------|---------|
| Light | ~28px tall | Slim frame, tall slim helmet | Chaingun / blaster | Most frequent spawns |
| Medium | ~34px tall | Balanced, visor band | Spinfusor (blue) | Moderate spawns |
| Heavy | ~38px tall | Bulky torso, shoulder pads | Green-tipped mortar | Rare |

Each warrior renders as an SVG with a **body rotation** slot driven by the physics path tangent (max ±20°), a **jetpack flame group** whose scale tracks vertical velocity, and a **weapon barrel** that emits a muzzle flash when a projectile spawns.

### Motion

Warriors follow a **ski-arc path** across the screen — a wavy curve with two to three peaks. Horizontal velocity is roughly constant; vertical position oscillates. Flame intensity scales with `abs(dy/dt)`; tilt tracks the tangent angle. Faint blue speed streaks render behind the warrior during downslope phases only.

The path shape and duration are kit-configurable. Default: 7s total, 2–3 arc peaks, amplitude ~50px within the kit's `laneRange`.

### Projectile impacts

Each weapon drops a different damage decal *and* (for Medium and Heavy) transforms nearby terminal characters:

**Light — Chaingun pepper**
- 3–5 small round bullet-hole decals clustered at the impact point.
- No character transform. Pure decal.

**Medium — Spinfusor (fusion blue)**
- Fusion-blue radial burst + electric ring + a few white-blue sparks.
- **Character effect**: characters within a ~60×40px ellipse centered on impact get split into two fates based on y-position relative to the impact center:
  - **Above center** → vaporize: flash hot-blue, fade to ghost, dissolve into rising cyan mist puffs.
  - **Below center** → melt: stretch scaleY 1.8–2.4, shift to blue, drip into a glowing puddle on the line below.

**Heavy — Green plasma mortar**
- The warrior lobs a green plasma ball (arcing projectile, not straight like a disc).
- On detonation: white→lime→green radial flash, expanding green shockwave ring, smoking crater.
- **Character effect**: characters within a ~100px radius are "detached" — rendered as individual glyphs at offset positions with random rotation (-120° to +120°) and outward translation. A column of green smoke rises from ground zero and lingers.
- Much larger blast radius than Medium.

### Heal animation

When `busy` goes false for the active scope, all active impacts run a heal pass:
- Decals fade opacity 1 → 0 over ~600ms.
- Vaporized characters reappear at original position (fade in).
- Melted drips retract upward.
- Blasted mortar particles arc back to home position with ease-out.
- Smoke and sparks fade out.
- On completion, the damage overlay clears entirely.

If a new impact lands during a heal pass, it cancels the heal for overlapping characters and re-damages them.

## Architecture

### Files touched

| File | Change |
|------|--------|
| `src/components/whammy/kits.jsx` | Rewrite `tribes2Kit`: add `tier` dimension, new SVG renderers per tier, new `buildSkit` that emits tier-specific projectiles with impact payloads. |
| `src/components/WhammyOverlay.jsx` | Extend to handle a new entity type: **Impact** (decal + character transforms). Add heal-phase handling. |
| `src/index.css` | New animations: `whammy-ski-arc` (path-based translate + rotate), `whammy-mortar-lob` (parabolic projectile), `whammy-vaporize`, `whammy-melt-drip`, `whammy-mortar-blast`, `whammy-heal`. |
| *(new)* `src/components/whammy/ImpactOverlay.jsx` | Dedicated DOM layer that holds decals and character-particle spans. Positioned absolute over the xterm canvas, z-index above xterm. |
| *(new)* `src/components/whammy/physics.js` | Helpers: `skiArcPath(lane, amplitude, peaks, duration)`, `mortarArcPath(start, end, peakHeight)`, `sampleTangent(path, t)`. Pure functions. |
| `src/store/useStore.js` | No schema change required — existing `claudeBusy` and `activeKitId` are sufficient. |

### Data flow

1. `busy` flips true for the active scope.
2. `WhammyOverlay` spawns a kit payload at each `spawnInterval` tick. For `tribes2`, payload now includes:
   - `warriors[]` with `tier`, `team`, `pathId`, `duration`.
   - `projectiles[]` with `weapon`, `spawnDelay`, `originPath`, `impactPoint`, `impactPayload`.
3. Each projectile animates from its origin to `impactPoint`. On animation end, its `impactPayload` is handed to `ImpactOverlay`.
4. `ImpactOverlay` renders the decal and character transforms at `impactPoint` coordinates. Impacts persist until `busy` goes false.
5. On `busy → false`, all impacts run their heal animation, then are removed.

### Character-transform implementation

Characters aren't read from xterm — they're *invented* by the overlay. The overlay writes its own glyph spans at the impact coordinates. Fonts and colors match the terminal theme (JetBrains Mono 13px, foreground `#e2e8f0` + terminal color codes), so they look like they came from the real text. Under a mortar impact, the underlying xterm canvas is masked by a dark semi-transparent crater; our glyph particles float on top as the "blasted" text. When heal runs, the mask fades and the real underlying text is revealed unchanged.

This keeps xterm completely untouched and avoids any risk to PTY output.

## Performance notes

- At most one Heavy mortar impact per skit — caps particle count.
- Medium character transforms use ~10 glyph spans per hit, max 3 concurrent hits.
- All animations use CSS transforms (GPU) and `will-change: transform, opacity` on particle spans.
- When an impact's heal finishes, DOM nodes are removed — no leaks.
- If `busy` flips rapidly, the SFX cooldown (existing 10s) applies; visual state resets on the `key` change of `WhammyOverlay` (already keyed on `activeTabId || scope.id`).

## Open questions (to resolve during planning)

- Mortar projectile sprite — do we draw the green plasma ball as a simple gradient circle with a glow trail, or a small SVG with rotation? (Default: gradient circle + trail.)
- Exact frequency of Heavy spawns — maybe 1 in 4 skits? Too frequent and it loses impact; too rare and no one sees it.
- Do Light/Medium warriors ever fire at the Heavy, or only at each other? (Default: team-based — Blue team fires at Red regardless of tier.)

---

## Post-implementation truing-up notes (2026-04-23)

The spec above is the original design. Reality after the first implementation pass:

### File split — `tribes2Kit` lives in its own module

The spec said "Rewrite `tribes2Kit` in `kits.jsx`." Implementation actually **split tribes into its own module** at `src/components/whammy/tribes.jsx` (220 LOC) — `kits.jsx` now imports it via `import { tribes2Kit } from './tribes'`. `kits.jsx` keeps the Classic Whammies kit and shared SVG primitives. This is cleaner and was made permanent in commit `752b1ec`.

Updated **Files touched** table:

| File | Status | Purpose |
|------|--------|---------|
| `src/components/whammy/kits.jsx` | modified | Registry + Classic Whammies kit + shared SVG primitives. Imports tribes2Kit from './tribes'. |
| `src/components/whammy/tribes.jsx` | **new** | All Tribes 2 assets: LightRaider/MediumRaider/HeavyRaider × Blue/Red, projectile SVGs, `buildSkit`/`buildSolo` builders, `JetpackFlame` helper. |
| `src/components/whammy/physics.js` | new | `TIER_CONFIG`, `SKI_ARC_PATHS`, `pickTier()`, `pickArcPath()`, `mortarLobPath()`. |
| `src/components/whammy/ImpactOverlay.jsx` | new | Damage decal layer (chaingun holes, fusion rings, mortar craters). Mounted as a sibling inside `WhammyOverlay`, NOT inside `Terminal.jsx`. |
| `src/components/WhammyOverlay.jsx` | modified | Spawns warrior + projectile entities; mounts `ImpactOverlay`; manages impact lifecycle and heal phase. |
| `src/components/dashboard/WhammyStudio.jsx` | **new** | Studio dashboard tab — kit picker, variant gallery, playground stage with idle/run/dance/spin modes, Solo/Skit/Full Parade preview. NOT in original spec — added during implementation as an observability/configuration surface. |
| `src/components/dashboard/StudioOverview.jsx` | modified | Adds "Whammies" tab to dashboard tab bar; renders WhammyStudio when active. |
| `src/utils/claudeBusyDetector.js` | new | PTY stream parser watching spinner glyphs / "esc to interrupt" sentinels with ~4s idle timeout. Drives `claudeBusy` per scope in store. |
| `src/store/useStore.js` | modified | Added `claudeBusy` per-scope flag and `activeKitId` (persisted to localStorage). No deeper schema change, as predicted. |
| `src/components/Terminal.jsx` | modified | One-line mount of `WhammyOverlay` keyed on `activeTabId || scope.id` (line 827). |
| `src/index.css` | modified | Whammy keyframes (ski-arc, mortar lob, decal classes, heal). |

### Implementation gap — character-particle transforms not built

The spec promises three character-transform effects on Medium/Heavy impacts:

- **Spinfusor vaporize** — chars above impact center flash hot-blue, fade to ghost, dissolve into cyan mist.
- **Spinfusor melt** — chars below impact center stretch and drip into a glowing puddle.
- **Mortar detach** — chars within ~100px get rendered as individual rotated/translated glyph spans.

CSS keyframes for these effects (`whammy-vaporize`, `whammy-melt-drip`, `whammy-mortar-particle`) **were added** in commit `5be2873`, but **no React code spawns the glyph DOM nodes**. `ImpactOverlay.jsx` renders only the decals (holes, rings, cores, craters, shockwaves, smoke). The glyph-particle layer is not wired.

This is documented as Architectural Concern #1 in the Solutions Architect 2026-04-23 trueing-up review and tracked as a follow-up decision: implement the glyph layer, or narrow the spec to "decals only" and remove the orphaned CSS.

### Hardcoded muzzle offsets in two places

`WhammyOverlay.jsx` and `WhammyStudio.jsx` both define their own `MUZZLE_DX` / `MUZZLE_DY` constants (the latter so the Studio preview can fire projectiles independently of the live terminal). These should be centralized — likely in `physics.js` alongside `TIER_CONFIG` — to avoid drift between live overlay and Studio preview.
