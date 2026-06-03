=== BFP Bricks Floating Panels ===
Contributors: truemtn
Tags: bricks, bricks builder, page builder, ui, panels
Requires at least: 5.8
Tested up to: 7.0
Requires PHP: 7.4
Stable tag: 1.8.6
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Float the Bricks builder's Settings and Structure panels as draggable overlays so they stop squeezing the canvas, with a Beaver-Builder-style feel.

== Description ==

Bricks Floating Panels turns the Bricks builder's docked Settings and Structure
panels into draggable, resizable floating overlays. It loads only inside the
Bricks builder and never touches the front end of your site.

Each panel has three states from a segmented control in the top toolbar:

* Locked — Bricks' native docked layout (native panel resize works here).
* Float — a draggable overlay with scale/fade animation, edge snapping, and
  S/M/L/XL width presets.
* Off — hidden so the canvas is full width. Press Off again to restore.

Highlights:

* Click a canvas element to auto-open Settings; click empty canvas to tuck it away.
* Click a floating panel to bring it to the front.
* Tear-off: drag the grab tab on a docked panel's edge to pop it into float.
* While Settings floats, Bricks' element quick-access toolbar rides along on its
  left, mirroring the docked look, with a one-click lock button to dock it back.
* Advanced Themer's elements bar gets a readable dark background while floating.
* State, size, and position persist per browser.

Shortcut: Cmd/Ctrl + Shift + F toggles floating for both panels.

== Installation ==

1. Upload the plugin zip via Plugins > Add New > Upload Plugin, or copy the
   `bricks-floating-panels` folder to `wp-content/plugins/`.
2. Activate it from the Plugins screen.
3. Open any page in the Bricks builder. The Settings / Structure controls appear
   in the top toolbar, just left of Undo.

This plugin requires the Bricks theme/builder to be active.

== Frequently Asked Questions ==

= Does it change my live site? =
No. It only loads inside the Bricks builder interface.

= Do I lose anything if I deactivate it? =
No. The builder returns to its normal docked panels.

== Changelog ==

= 1.8.6 =
* Advanced Themer's right-side element shortcuts bar now gets a solid dark
  background while a panel is floating (targeted by its exact class), so its
  icons stay readable over the canvas.
* Removed the 48px top margin that left a white gap above the docked Structure
  panel.

= 1.8.5 =
* Confirmed compatibility with WordPress 7.0 and verified automatic update delivery to WordPress sites.

= 1.8.3 =
* Renamed the plugin to "BFP Bricks Floating Panels" for clearer identification in the Plugins list.
* Fixed the GitHub update checker, which was disabled by a leftover placeholder guard, so future versions now appear as plugin updates automatically.

= 1.8.2 =
* Added a lock (dock) button in the floating drag bar.
* Quick-access toolbar collapse is tamed while floating; it shows correctly even
  if it was collapsed beforehand.

= 1.8.1 =
* Quick-access toolbar tracks the panel instantly during drag (no lag).

= 1.8.0 =
* Bricks' element quick-access toolbar now rides along on the floating Settings
  panel's left edge; Settings spawns in the corner again.

= 1.7.0 - 1.7.9 =
* Three-state segmented control (Locked / Float / Off), tear-off drag, click-to-
  front, lock-to-float returns to corner, native resize restored when docked,
  header alignment, color refinements, and scrollbar visibility.

= 1.6.x =
* Preset width sizing, Advanced Themer bar background, toolbar placement, state
  icons, and assorted fixes.

= 1.5.0 =
* Stylesheet-based geometry so Bricks re-renders can't break floating panels.
