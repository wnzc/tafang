# Combat UI Polish Implementation Plan

**Goal:** Make combat feedback target enemies, improve readable controls and lists, and diversify each wave's enemy composition.

**Architecture:** Keep game rules in `waves.js` and `resonance.js`; keep all interactive geometry in `ui.js`; render from those shared values in `render.js`; extend the Node simulation and layout checker with observable contracts.

**Tech Stack:** ES5 JavaScript, Canvas 2D, Node.js self-check scripts.

## Global Constraints

- Preserve the project’s ES5 syntax and zero external-resource policy.
- Do not modify `project.private.config.json`.
- Use `ui.js` geometry for both drawing and hit testing.

### Task 1: Reaction targeting and wind balance

**Files:** `js/resonance.js`, `js/config.js`, `tools/simulate.js`

1. Add a failing integration assertion that a vaporization effect is anchored at the hit enemy rather than its tower junction, then reduce flow tower range and gust radius by half.
2. Resolve the nearest living enemy in a reaction node’s radius and use that target as the center for reaction effects and area checks; retain a quiet node pulse if no target is present.
3. Run `node tools/simulate.js 50000` and verify the target anchor and the new wind values.

### Task 2: Mixed wave composition and compact labels

**Files:** `js/waves.js`, `js/main.js`, `tools/simulate.js`

1. Add a failing assertion that a non-boss wave with more than one unlocked type has interleaved primary and secondary spawns.
2. Interleave primary and secondary spawn events while retaining the original count, timing envelope, deterministic seed behavior, and heavy-unit adjustment.
3. Expose a short wave label (`敌群来袭` or `首领来袭`) and use it in the combat banner.
4. Run the full simulation and assert no combat banner exceeds the intended display width.

### Task 3: Shared UI geometry and interactions

**Files:** `js/ui.js`, `js/main.js`, `js/render.js`, `tools/layout-check.js`

1. Add failing geometry assertions for two action buttons on the settlement page, two explicit actions in in-run settings, and vertically separated codex-list text.
2. Add shared rectangles for retry/home and continue/home; wire them into state transitions without resetting settings.
3. Draw the paired controls, lift codex labels away from their subtitles, and update the core to an identifiable two-cell reactor visual.
4. Run `node tools/layout-check.js` and confirm every device/font profile passes.

### Task 4: Tower visual hierarchy and regression

**Files:** `js/render.js`, `tools/layout-check.js`

1. Increase the tower-center elemental icon and its contrast disc while preserving the tower silhouette and cooldown ring.
2. Add a layout contract for its in-cell diameter and run `node tools/layout-check.js`, `node tools/simulate.js 50000`, and the rich simulation.
