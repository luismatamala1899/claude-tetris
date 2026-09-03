# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Classic Tetris in vanilla JavaScript, HTML5 Canvas, and CSS. No dependencies, no build step, no `package.json`.

## Running / testing

No install or build. Open `index.html` directly, or serve statically:

```bash
python3 -m http.server 8000
npx serve .
php -S localhost:8000
```

No test suite, linter, or bundler exists. Verify changes by loading the page in a browser and playing.

## Architecture

Three files, no modules:

- `index.html` — DOM structure: `#board` canvas (300×600, 10×20 grid at `BLOCK=30`px), `#next-canvas` (piece preview), HUD spans (`#score`, `#lines`, `#level`), and the pause/game-over `#overlay`.
- `style.css` — dark/retro arcade visuals.
- `game.js` — all game logic, as top-level functions and module-scoped `let` state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropAccum`, `dropInterval`, `animId`). No classes, no state management library.

Key mechanics in `game.js`:

- **Board**: `ROWS × COLS` matrix; each cell is `0` (empty) or a piece color index `1–7`.
- **Pieces**: square matrices in `PIECES`; rotation (`rotateCW`) is transpose + row-reverse, not a stored rotation-state table.
- **Collision** (`collide`): bounds + board-overlap check, reused for movement, rotation, and ghost-piece projection.
- **Wall kicks** (`tryRotate`): after rotating, tries x-offsets `[0, -1, 1, -2, 2]` until one doesn't collide.
- **Game loop** (`loop`): `requestAnimationFrame`-driven; accumulates `dt` and drops the piece one row when `dropAccum >= dropInterval`.
- **Locking** (`lockPiece`): `merge()` piece into board → `clearLines()` → `spawn()` next piece (spawn colliding immediately triggers `endGame()`).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × `level`; hard drop adds 2 pts/row dropped, soft drop 1 pt/row.
- **Leveling**: level = `floor(lines / 10) + 1`; `dropInterval = max(100, 1000 - (level-1)*90)` ms.

If changing `COLS`, `ROWS`, or `BLOCK`, also update the `#board` canvas `width`/`height` in `index.html` to match (`COLS×BLOCK` by `ROWS×BLOCK`).

Controls: ←/→ move, ↑ or X rotates, ↓ soft-drops, Space hard-drops, P pauses.
