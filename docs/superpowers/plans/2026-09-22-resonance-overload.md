# 共振过载 Implementation Plan

> **For agentic workers:** Execute inline, task-by-task. This repository explicitly forbids automatic commits.

**Goal:** Add automatic fire, electro, and anemo resonance-overload combat events driven by successful elemental reactions.

**Architecture:** `config.js` declares all tunable overload data and reaction ownership. `main.js` owns the displayed meter/cooldown state, while `resonance.js` charges and triggers bounded one-shot effects. `enemies.js` supplies safe attraction for wind, and `render.js` renders the status without adding a player action.

**Tech Stack:** Vanilla JavaScript, Canvas 2D, WeChat Mini Game APIs, Node assertion scripts.

## Global Constraints

- No external dependencies, assets, Worker APIs, or new player controls.
- Successful reaction hits only; empty nodes never charge the meter.
- Fire, electro, and anemo are the only first-release overload effects.
- All overload damage uses the existing armor-piercing damage path.
- Effects remain bounded under the `FX.MAX` budget; do not auto-commit.

---

### Task 1: Declare overload data and game state

**Files:**
- Modify: `js/config.js`
- Modify: `js/main.js`
- Test: `tools/simulate.js`

- [ ] Add `CFG.RES.overload` with exact threshold, cooldown, per-element values, and `overloadElem` on supported reaction definitions.
- [ ] Initialize and reset `game.overload` as `{ value, cooldown, elem, flash, lastElem }`; decrement visual timers in `G.Game.update`.
- [ ] Add a simulator assertion that an empty reaction node leaves `game.overload.value` unchanged.

### Task 2: Charge and resolve fire/electro overload

**Files:**
- Modify: `js/resonance.js`
- Modify: `tools/simulate.js`

- [ ] Add `RES.addOverload(game, node, target)` after a successful reaction target is found; reject missing or unsupported ownership and cooldown state.
- [ ] Add `triggerPyroOverload` with bounded chain targets and burning application.
- [ ] Add `triggerElectroOverload` with a seven-tower/target cap and visual bolts from actual electro towers.
- [ ] Add deterministic simulator cases that force each trigger, verify cooldown/reset, and observe armor-piercing damage.

### Task 3: Add safe wind attraction and wind overload

**Files:**
- Modify: `js/enemies.js`
- Modify: `js/resonance.js`
- Modify: `tools/simulate.js`

- [ ] Add `G.Enemies.pull(enemy, x, y, amount)` as a short velocity field toward a point, with board and enemy mass bounds.
- [ ] Advance and clear pull velocity in the ordinary enemy update path without bypassing walls or combining with knockback.
- [ ] Add `triggerAnemoOverload`, which selects the reaction target as eye center, pulls nearby enemies, deals bounded piercing damage, and emits a wind-ring burst.
- [ ] Add a simulation case proving light enemies move toward the eye, bosses/heavy units move less, and no entity exits the board.

### Task 4: Render and verify the overload state

**Files:**
- Modify: `js/render.js`
- Modify: `tools/layout-check.js`
- Modify: `README.md`

- [ ] Draw a compact HUD “共振临界” meter below the energy value, showing charge, cooldown, and active element color.
- [ ] Draw a brief full-board color wash only while `game.overload.flash > 0`.
- [ ] Add layout assertions for the meter’s boundaries against the existing HP, energy, capsule-safe right column, and all font levels.
- [ ] Document the automatic trigger, three first-release effects, and validation commands.
- [ ] Run `node tools/simulate.js`, `node tools/simulate.js 12000 --deep`, `node tools/layout-check.js`, and `node tools/font-check.js`; inspect `git diff --check` and do not commit.
