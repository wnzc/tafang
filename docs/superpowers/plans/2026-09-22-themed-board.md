# Themed Board Implementation Plan

> **For agentic workers:** Execute inline with TDD. This repository explicitly forbids automatic commits.

**Goal:** Separate the resonance meter text from its fill and render a deterministic mutation-themed board beneath gameplay entities.

**Architecture:** `config.js` owns theme palettes; `render.js` derives a stable per-wave theme from `game.waveData.mut.list` and paints it before grid occupants. The layout remains the sole source of HUD positions.

**Tech Stack:** Vanilla JavaScript, Canvas 2D, Node simulation/layout checks.

## Global Constraints

- No assets or dependencies; all terrain is Canvas geometry.
- Decorations must be deterministic per run/wave and remain below gameplay entities.
- Text never overlays the resonance meter fill.
- Do not auto-commit.

### Task 1: HUD geometry and regression assertion

**Files:** `js/config.js`, `js/render.js`, `tools/layout-check.js`.

- [ ] Add separate label/value/bar anchors in `buildLayout`.
- [ ] Render label and value outside the progress rectangle.
- [ ] Add all-font-level non-overlap assertions; run `node tools/layout-check.js`.

### Task 2: Deterministic theme selection and board paint

**Files:** `js/config.js`, `js/render.js`, `tools/simulate.js`.

- [ ] Add named palette data for base and each mutation-family theme.
- [ ] Add render-private theme lookup and seeded tile decoration helpers.
- [ ] Paint tinted cells, terrain marks, themed spawn portals, and retain the fixed core treatment.
- [ ] Add simulation assertions for stable lookup and distinct mutation families; run `node tools/simulate.js`.

### Task 3: Full verification

**Files:** `README.md`.

- [ ] Document the themed-board rule.
- [ ] Run ordinary/deep simulation, layout, font, and `git diff --check`; do not commit.
