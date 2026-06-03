# BFP Bricks Floating Panels

Turns the Bricks builder's docked Settings and Structure panels into draggable,
floating overlays so they stop squeezing the canvas, with a Beaver-Builder-style
feel. Loads only inside the Bricks builder and never touches the front end.

- **Author:** True Mtn Marketing
- **Current version:** 1.8.3
- **Requires:** WordPress 5.8+, PHP 7.4+, Bricks (active)

## What it does

Each panel (Settings `#bricks-panel`, Structure `#bricks-structure`) has three
mutually exclusive states, chosen from a segmented control in the top toolbar
(inserted to the left of Undo so Bricks' Save stays at the far right):

- **Locked** — Bricks' native docked layout. Native panel resize works here.
- **Float** — a draggable overlay that scales/fades in, snaps to the top edge,
  and docks when dragged to a side edge. Sized with S/M/L/XL width presets.
- **Off** — hidden; canvas is full width. The Off button toggles: pressing it
  again restores the last state. Each floating panel's `×` also sets Off.

Other behavior:

- Clicking a canvas element auto-opens Settings; clicking empty canvas tucks it
  away again (only if it was auto-opened).
- Click a floating panel to bring it above the other (last-clicked wins).
- Reopening from Off/Locked returns the panel to its default top corner.
- Tear-off: drag the grab tab on a docked panel's canvas-facing edge to pop it
  into float.
- When Settings floats, Bricks' element quick-access toolbar
  (`#bricks-panel-element-quick-access`) is pinned to the panel's left edge so it
  rides along, mirroring the docked look.
- Advanced Themer's far-right elements bar gets a dark background while a panel
  is floating so its icons stay readable.
- State, size, and position persist per browser via `localStorage`.

Toggle floating for both panels at once with **Cmd/Ctrl + Shift + F**.

## How it works (key decisions)

- **Geometry via an injected stylesheet.** Float position/size/visibility is
  written into `<style id="bfp-dynamic">` targeting each panel **by ID** with
  `!important`. Bricks re-renders the panel nodes constantly, which would wipe
  class- or inline-based styling mid-interaction; an ID rule keeps applying. This
  is what fixed the early "resize disappears / grows on hover" glitch.
- **Listeners on `document` + body-level overlays.** Drag/resize/tear-off
  listeners live on the document (not the panel node), and the iframe's pointer
  events are disabled during a drag so a mouse-up over the canvas is always
  caught. A `ResizeObserver` keeps the tear-off tab aligned during native resize.
- **No DOM relocation.** The quick-access bar and Advanced Themer bar are
  repositioned/styled in place, never moved in the DOM, so their native
  click/drag-to-insert behavior is preserved.
- **Sizing is preset-only.** Drag-to-resize fought Bricks' own panel sizing, so
  floating panels use S/M/L/XL width presets instead; the native resize grip is
  suppressed only while floating and restored when docked.

## File structure

```
bricks-floating-panels/
├── bricks-floating-panels.php   # plugin header + conditional asset enqueue
└── assets/
    ├── floating-panels.css      # chrome styling (drag bar, controls, tabs)
    └── floating-panels.js       # all behavior
```

## Versioning

The version lives in two spots in `bricks-floating-panels.php` and must match:
the header `Version:` comment and the `BFP_VERSION` constant. `BFP_VERSION` is
the asset cache-buster, so bump it on every change or browsers serve stale JS/CSS.

`localStorage` state is migrated forward via a `STATE_V` marker in the JS; bump
it when you need to reset users' saved positions.

## Known caveats

- Advanced Themer's bars are matched by shape (a narrow, tall, edge-hugging strip
  with several icon children), not a fixed selector, since AT's markup can vary.
  A future AT update could require retuning.
- Everything is keyed to Bricks element IDs (`#bricks-panel`,
  `#bricks-structure`, `#bricks-toolbar`, `#bricks-builder-iframe`,
  `#bricks-panel-element-quick-access`). If a Bricks update renames one, update
  the corresponding reference.
