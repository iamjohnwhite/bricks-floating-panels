# BFP Bricks Floating Panels

Turns the Bricks builder's docked Settings and Structure panels into draggable,
floating overlays so they stop squeezing the canvas, with a Beaver-Builder-style
feel. Loads only inside the Bricks builder and never touches the front end.

- **Author:** John White
- **Current version:** 2.0.6
- **Requires:** WordPress 5.8+, PHP 7.4+, Bricks (active)

## What it does

Each panel (Settings `#bricks-panel`, Structure `#bricks-structure`) has three
mutually exclusive states, chosen from a segmented control in the top toolbar
(inserted to the left of Undo so Bricks' Save stays at the far right):

- **Locked** — Bricks' native docked layout. Native panel resize works here.
- **Float** — a draggable overlay that scales/fades in, snaps to the top edge,
  and docks when dragged to a side edge. Width is set with S/M/L/XL presets and
  height is dragged from a handle on the panel's bottom edge.
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

## Beta add-ons (2.0)

2.0 introduced a dashboard settings page at **Bricks → Floating Panels** (falls
back to **Settings → Floating Panels** if the Bricks menu isn't present). These
extras are all **off by default** and flagged as beta, so the core experience is
unchanged unless a user opts in. Options are stored in the `bfp_options` option
and passed to the builder via `BFP_SETTINGS.options`.

- **Transparency.** Makes floating panels see-through, with an opacity slider
  (10–100%, ~80% recommended). A droplet icon on each floating panel's title bar
  toggles it live; the dashboard setting is the master switch (turning it off
  forces panels solid). Only floating panels go transparent — locked/stacked
  stay solid.
- **Avoid the selected element.** When you select an element a floating panel is
  covering, the panel nudges just past the element's nearest edge (least
  movement; farthest edge if it can't fully clear). You choose whether it moves
  Settings, Structure, or both, and two moved panels sit adjacent rather than on
  top of each other.
- **Side-docking (stacked / tabbed).** A toolbar stack icon (shown when enabled)
  locks both panels onto one side as a true dock: the canvas reserves a gutter
  and shrinks rather than the panels floating over the design. Stacked shows both
  (split height); tabbed shows one at a time with a switcher. Float is disabled
  while stacked.

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
- **Sizing.** Width uses S/M/L/XL presets (drag-to-resize once fought Bricks'
  own panel sizing). Height is drag-resizable from a bottom-edge handle, which is
  reliable now that geometry is driven through the injected stylesheet. The
  native resize grip is suppressed while floating and restored when docked.
- **Per-panel scroll.** Settings keeps `overflow:hidden` (it has its own inner
  scroll, so this avoids a double scrollbar); Structure uses `overflow:auto`
  because it has no inner scroll container and would otherwise be unscrollable.

## File structure

```
bricks-floating-panels/
├── bricks-floating-panels.php   # plugin header, asset enqueue, settings page, updater
├── readme.txt                   # WordPress-format readme + changelog
├── plugin-update-checker/       # YahnisElsts library for GitHub auto-updates
└── assets/
    ├── floating-panels.css      # chrome styling (drag bar, controls, tabs, handles)
    └── floating-panels.js       # all behavior
```

## Versioning & updates

The version lives in three spots that must match: the header `Version:` comment
and the `BFP_VERSION` constant in `bricks-floating-panels.php`, and `Stable tag`
in `readme.txt`. `BFP_VERSION` is the asset cache-buster, so bump it on every
change or browsers serve stale JS/CSS.

Updates are delivered from GitHub releases via Plugin Update Checker (pointed at
`BFP_GITHUB_REPO`). Tag a release matching the version and installed sites see it
on their Plugins screen, normally within ~12 hours or instantly via "Check
Again."

`localStorage` state is migrated forward via a `STATE_V` marker in the JS; bump
it when you need to reset users' saved positions.

## Known caveats

- Advanced Themer's bars are matched by shape (a narrow, tall, edge-hugging strip
  with several icon children), not a fixed selector, since AT's markup can vary.
  A future AT update could require retuning.
- Everything is keyed to Bricks element IDs (`#bricks-panel`,
  `#bricks-structure`, `#bricks-toolbar`, `#bricks-builder-iframe`,
  `#bricks-builder-iframe-wrapper`, `#bricks-preview`,
  `#bricks-panel-element-quick-access`). If a Bricks update renames one, update
  the corresponding reference.
- Side-docking's space reservation pads `#bricks-preview` and caps the canvas
  wrapper; it depends on Bricks' centered-canvas layout, so it's the most
  experimental of the beta add-ons.
